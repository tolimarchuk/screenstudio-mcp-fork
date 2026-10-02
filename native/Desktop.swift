import ApplicationServices
import Cocoa
import CoreGraphics

func fail(_ text: String) -> Never {
  fputs(text + "\n", stderr)
  exit(1)
}
let args = CommandLine.arguments
if args.count < 3 { fail("Expected action and window ID") }
let action = args[1]
guard let id = UInt32(args[2]) else { fail("Invalid window ID") }
let windows =
  CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
  as? [[String: Any]] ?? []
guard let window = windows.first(where: { ($0[kCGWindowNumber as String] as? UInt32) == id }),
  let pid = window[kCGWindowOwnerPID as String] as? Int32,
  let raw = window[kCGWindowBounds as String] as? NSDictionary,
  let bounds = CGRect(dictionaryRepresentation: raw)
else { fail("Target window is no longer on screen") }
let title = window[kCGWindowName as String] as? String ?? ""
func output(_ value: Any) {
  guard let d = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
    let s = String(data: d, encoding: .utf8)
  else { fail("JSON failed") }
  print(s)
}
func focusedDetails() -> [String: Any] {
  guard AXIsProcessTrusted(), NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
  else { return [:] }
  var rawElement: CFTypeRef?
  AXUIElementCopyAttributeValue(
    AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute as CFString, &rawElement)
  guard let rawElement = rawElement, CFGetTypeID(rawElement) == AXUIElementGetTypeID() else {
    return [:]
  }
  let element = rawElement as! AXUIElement
  func attribute(_ name: String) -> String {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return value as? String ?? ""
  }
  let subrole = attribute(kAXSubroleAttribute)
  return [
    "role": attribute(kAXRoleAttribute), "label": attribute(kAXTitleAttribute),
    "value": subrole == "AXSecureTextField" ? "[protected]" : attribute(kAXValueAttribute),
  ]
}
if action == "inspect" {
  output([
    "windowId": id, "pid": pid, "title": title,
    "bounds": [
      "x": bounds.origin.x, "y": bounds.origin.y, "width": bounds.width, "height": bounds.height,
    ], "focusedElement": focusedDetails(), "accessibility": AXIsProcessTrusted(),
    "frontmost": NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
  ])
  exit(0)
}
guard AXIsProcessTrusted() else {
  fail(
    "Enable Accessibility for the desktop helper in macOS Settings, then inspect the target again")
}
let app = AXUIElementCreateApplication(pid)
var focused: CFTypeRef?
AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &focused)
func matches(_ ax: AXUIElement) -> Bool {
  var p: CFTypeRef?
  var s: CFTypeRef?
  AXUIElementCopyAttributeValue(ax, kAXPositionAttribute as CFString, &p)
  AXUIElementCopyAttributeValue(ax, kAXSizeAttribute as CFString, &s)
  guard let p = p, let s = s, CFGetTypeID(p) == AXValueGetTypeID(),
    CFGetTypeID(s) == AXValueGetTypeID()
  else { return false }
  var point = CGPoint.zero
  var size = CGSize.zero
  AXValueGetValue(p as! AXValue, .cgPoint, &point)
  AXValueGetValue(s as! AXValue, .cgSize, &size)
  return abs(point.x - bounds.origin.x) < 2 && abs(point.y - bounds.origin.y) < 2
    && abs(size.width - bounds.width) < 2 && abs(size.height - bounds.height) < 2
}
if action == "focus" {
  var value: CFTypeRef?
  AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value)
  let candidates = (value as? [AXUIElement] ?? []).filter(matches)
  guard candidates.count == 1 else { fail("Cannot uniquely match the target window for focus") }
  AXUIElementPerformAction(candidates[0], kAXRaiseAction as CFString)
  NSRunningApplication(processIdentifier: pid)?.activate(options: [])
  usleep(200000)
  output(["focused": true])
  exit(0)
}
guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid, let focused = focused,
  CFGetTypeID(focused) == AXUIElementGetTypeID(), matches(focused as! AXUIElement)
else { fail("Focus changed. Inspect and focus the target before acting") }
func assertFocus() {
  var now: CFTypeRef?
  AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &now)
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid, let now = now,
    CFGetTypeID(now) == AXUIElementGetTypeID(), matches(now as! AXUIElement)
  else { fail("Focus changed during input. Inspect the target again") }
}
let source = CGEventSource(stateID: .hidSystemState)
func post(_ event: CGEvent?) {
  guard let event = event else { fail("Cannot create input event") }
  event.post(tap: .cghidEventTap)
}
func point() -> CGPoint {
  guard args.count >= 5, let x = Double(args[3]), let y = Double(args[4]), x.isFinite, y.isFinite,
    x >= 0, y >= 0, x < bounds.width, y < bounds.height
  else { fail("Coordinates must be inside the target window") }
  return CGPoint(x: bounds.origin.x + x, y: bounds.origin.y + y)
}
func move(_ target: CGPoint) {
  let initial = CGEvent(source: nil)?.location ?? target
  for i in 1...20 {
    assertFocus()
    let t = Double(i) / 20
    let eased = t * t * (3 - 2 * t)
    post(
      CGEvent(
        mouseEventSource: source, mouseType: .mouseMoved,
        mouseCursorPosition: CGPoint(
          x: initial.x + (target.x - initial.x) * eased,
          y: initial.y + (target.y - initial.y) * eased), mouseButton: .left))
    usleep(15000)
  }
}
switch action {
case "move": move(point())
case "click":
  let p = point()
  move(p)
  post(
    CGEvent(
      mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: p,
      mouseButton: .left))
  usleep(60000)
  post(
    CGEvent(
      mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)
  )
case "type":
  guard args.count == 4, args[3].utf16.count <= 2000 else { fail("Text is too long") }
  for char in args[3] {
    assertFocus()
    let text = Array(String(char).utf16)
    for down in [true, false] {
      guard let e = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down) else {
        fail("Key event failed")
      }
      e.flags = []
      text.withUnsafeBufferPointer {
        e.keyboardSetUnicodeString(stringLength: text.count, unicodeString: $0.baseAddress)
      }
      post(e)
    }
    usleep(35000)
  }
case "key":
  guard args.count == 4 else { fail("Missing key") }
  let keys: [String: CGKeyCode] = [
    "return": 36, "tab": 48, "escape": 53, "backspace": 51, "selectAll": 0,
  ]
  guard let key = keys[args[3]] else { fail("Unsupported key") }
  let selectAll = args[3] == "selectAll"
  if selectAll {
    let e = CGEvent(keyboardEventSource: source, virtualKey: 55, keyDown: true)!
    e.type = .flagsChanged
    e.flags = .maskCommand
    post(e)
    usleep(50000)
  }
  for down in [true, false] {
    guard let e = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: down) else {
      fail("Key event failed")
    }
    e.flags = selectAll ? .maskCommand : []
    post(e)
    usleep(50000)
  }
  if selectAll {
    let e = CGEvent(keyboardEventSource: source, virtualKey: 55, keyDown: false)!
    e.type = .flagsChanged
    e.flags = []
    post(e)
    usleep(50000)
  }
case "scroll":
  guard args.count == 4, let lines = Int32(args[3]), abs(lines) <= 100 else {
    fail("Invalid scroll amount")
  }
  post(
    CGEvent(
      scrollWheelEvent2Source: source, units: .line, wheelCount: 1, wheel1: lines, wheel2: 0,
      wheel3: 0))
default: fail("Unsupported action")
}
output(["action": action, "windowId": id, "performed": true])
