# Window Opacity Feature: Requirements + Failure Analysis Report
**Status:** ANALYSIS ONLY — No Code Changes Made  
**Date:** April 7, 2026

---

## EXECUTIVE SUMMARY

The IRA desktop app uses a **multi-window Tauri + React architecture** with 3 independent windows. A previous opacity implementation **failed because it was isolated to the Settings window** with no synchronization mechanism to other windows and no persistence layer.

**Key Finding:** The infrastructure exists to implement opacity correctly—it just wasn't wired together.

---

## 1. WINDOW ARCHITECTURE (Current State)

```
┌─────────────────────────────────────────────┐
│  TopBar Window (ExactIraUI)                 │
│  Size: 900×70px idle / 900×180px expanded    │
│  Transparency: true | Opacity: FIXED 100%    │
│  Role: IRA command bar + mode selector       │
└─────────────────────────────────────────────┘
                      ↓
    ┌─────────────────┬──────────────────┐
    │ Response Window │ Settings Window  │
    │ (ResponseUI)    │ (SettingsUI)     │
    │ Size: 900×650   │ Size: 900×820    │
    │ Trans: false    │ Trans: true      │
    │ Opacity: FIXED  │ Opacity: FIXED   │
    │ Chat/Agent mode │ Auth/License/Prefs
    └─────────────────┴──────────────────┘
```

### Window Creation Pattern
- **Main (TopBar):** Pre-configured in `tauri.conf.json`, created at startup
- **Response + Settings:** Created dynamically via `new WebviewWindow(label, config)` when needed
- Configuration: All use `alwaysOnTop=true`, `decorations=false`, no resizing, no taskbar

---

## 2. REQUIREMENT SPECIFICATION

### What Should Be Controllable?

#### ✅ **TopBar Window** (ExactIraUI)
- **Current:** `transparent: true` in config, `theme.topBar = "rgba(10, 10, 10, 0.92)"`
- **Should Allow:** Opacity slider control (0.5–1.0, step 0.1)
- **Apply Via:** Tauri `window.setOpacity(value)` API call
- **Impact:** Affects entire topbar appearance + readability

#### ✅ **Response Window** (ResponseWindowUI)
- **Current:** `transparent: false` with `backgroundColor: "#090909"`
- **Should Allow:** Opacity control (changes window transparency, not just CSS)
- **Constraint:** Must not break pink accent panel alignment (comment at line 165: "align 1:1 with the window")
- **Apply Via:** Same `setOpacity()` API

#### ✅ **Settings Window** (SettingsWindowUI)
- **Current:** `transparent: true`, height dynamically calculated
- **Should Allow:** Opacity slider (currently has no control)
- **Apply Via:** Tauri API or CSS transparency changes
- **Behavior Needed:** Fade-in animation on show, smooth transitions

#### ✅ **Popover/Dropdowns**
- **Current:** Popover.tsx has CSS fade animation `opacity: 0→1` (0.35s cubic-bezier)
- **Already Works:** Smooth transitions present
- **Should Ensure:** Consistency with window opacity changes

### Tauri API Available
```typescript
window.setOpacity(value: number)  // 0.0 (fully transparent) → 1.0 (fully opaque)
```
- Must call **after** window creation (`tauri://created` event)
- Works at runtime, dynamically adjustable
- Affects entire window including child elements

---

## 3. FAILURE ANALYSIS: Why Opacity Only Affected Settings

### Finding 1: Isolated State (Window Silo)
```tsx
// SettingsWindowUI.tsx — LIKELY previous attempt pattern:
const [windowOpacity, setWindowOpacity] = useState(1.0);
useEffect(() => {
  getCurrentWindow().setOpacity(windowOpacity);  // ← Only affects THIS window
}, [windowOpacity]);
```
**Problem:** Settings window opacity changed, but TopBar and Response windows stayed at 100%

### Finding 2: No Event Broadcasting
**Evidence:** Current event system uses `emitTo()`, `listen()` for:
- `"ira:response-ready"` — Response window initialized
- `"ira:response-state"` — Content/loading state changed
- `"ira:active-mode"` — Chat/Agent mode switched
- `"ira:clear-mode"` — Mode deactivated

**Missing:** No `"ira:opacity-changed"` event ← **This is Why It Failed**

Without events, changing opacity in Settings has **zero effect** on TopBar or Response windows.

### Finding 3: No Persistence Layer
**Current localStorage usage:**
```typescript
const STORAGE = {
  conversationId: "ira_current_conversation_id",
  activationId: "ira_activation_id",
  deviceId: "ira_device_id",
  accessToken: "ira_access_token",
  refreshToken: "ira_refresh_token",  // etc.
};
```
**Missing:** `ira_window_opacity_prefs` ← **Settings Lost After Restart**

### Finding 4: Debug Code Left in JSX
**Location:** ResponseWindowUI.tsx line ~200
```tsx
{activePanel === "agent" ? (
  <>
    {console.log("Agent Mode JSX rendered")}  // ← DEBUG CODE
    <div>...</div>
  </>
)}
```
**Evidence of:** Incomplete refactoring when opacity was attempted

### Finding 5: Async/Lifecycle Issues
Window opacity must be set **after** `tauri://created` event:
```tsx
const win = new WebviewWindow("response", config);
await new Promise<void>((resolve) => {
  void win.once("tauri://created", () => {
    // ← Opacity must be set HERE or after
    void positionResponseWindow().finally(resolve);
  });
});
```
**Likely Issue:** Opacity set before window was ready → silently failed

### Finding 6: No Global State
Each window has **isolated React state**. Changes in one don't affect others.
- Settings changes: Affects SettingsUI state only
- TopBar changes: Affects ExactIraUI state only
- Response changes: Affects ResponseUI state only
- **No synchronization mechanism**

### Finding 7: Missing Error Handling
Tauri API calls likely had no try/catch:
```tsx
// If this fails, no error message:
await getCurrentWindow().setOpacity(value);
```

---

## 4. FILES REQUIRING CHANGES

### 🔴 **Core Files (Must Change)**

| File | Purpose | Required Changes |
|------|---------|------------------|
| **ExactIraUI.tsx** | Main window + orchestration | Add opacity event listeners, apply to main window |
| **ResponseWindowUI.tsx** | Response panel | Remove debug console.log, add opacity listener, apply via setOpacity() |
| **SettingsWindowUI.tsx** | Settings UI + controls | Add opacity slider controls, emit events, save to localStorage |
| **WindowRouter.tsx** | Window routing | May need context provider for shared opacity state |

### 🟡 **Component Files (Likely Changes)**

| File | Purpose | Likely Changes |
|------|---------|-----------------|
| **TopBar.tsx** | TopBar UI | May house opacity control buttons (optional) |
| **theme.ts** | Color constants | May add opacity value constants |
| **index.css** | Root styles | Verify transparency declarations |

### 🟢 **Config Files (Read/Review Only)**

| File | Purpose | Action |
|------|---------|--------|
| **tauri.conf.json** | Tauri config | Review main window settings (no changes needed) |
| **Popover.tsx** | Popover component | Review animation consistency (no changes needed) |

### ✅ **No Changes Needed**
- App.tsx (appears to be placeholder/demo code)
- ResponseContentBox.tsx, MainResponsePanel.tsx (rendering only)
- LoginFlow components, IconGroup, Footer, etc.

---

## 5. SAFE IMPLEMENTATION ROADMAP

### ✅ **Phase 1: Build Foundation (Development)**
Goal: Establish infrastructure with ZERO user-facing changes

**Step 1.1** → Create shared opacity state module
- File: `desktopState.ts` (new)
- Exports: `useWindowOpacity()`, `useOpacityBroadcast()`
- Manages: { topBar, response, settings } opacity values
- Backed by: localStorage key `ira_window_opacity_prefs`

**Step 1.2** → Add event infrastructure
- File: ExactIraUI.tsx
- Add: Listen for `"ira:opacity-changed"` event
- Add: Emit broadcast to all windows via `emitTo()`
- Test: Console logs only, no UI yet

**Step 1.3** → Wire setOpacity() calls
- Files: ExactIraUI.tsx, ResponseWindowUI.tsx, SettingsWindowUI.tsx
- Add: useEffect hooks keyed to opacity state
- Wrap: Tauri API calls in try/catch
- Timing: Ensure calls happen after `tauri://created` or inside `useLayoutEffect`

✅ **Checkpoint:** App runs, opacity state exists, but no UI controls visible yet

---

### ✅ **Phase 2: Add UI Controls (User Can Adjust)**
Goal: Allow user to change opacity

**Step 2.1** → Create opacity controls UI
- File: SettingsWindowUI.tsx
- Add: `<OpacitySection>` with 3 sliders (TopBar, Response, Settings)
- Range: 0.5 → 1.0 (0.1 increments)
- Labels: "Transparent" | "Default" | "Opaque"

**Step 2.2** → Wire event broadcasting
- Files: SettingsWindowUI.tsx (emit), ExactIraUI.tsx + ResponseWindowUI.tsx (listen)
- On slider change: `emitTo()` `"ira:opacity-changed"` event
- On event receipt: Call `setOpacity()` on corresponding window

**Step 2.3** → Add persistence
- Files: ExactIraUI.tsx + SettingsWindowUI.tsx
- Save: On slider change → `localStorage.setItem("ira_window_opacity_prefs", JSON.stringify({...}))`
- Load: On app init → `useLayoutEffect` reads prefs, applies on window creation

✅ **Checkpoint:** User can adjust opacity, changes persist across app restarts

---

### ✅ **Phase 3: Optional TopBar Quick-Access (Nice-to-Have)**
Goal: Allow opacity adjustment without opening Settings

**Step 3.1** → Add mini opacity controls to TopBar menu
- File: TopBar.tsx or components/IconGroup.tsx
- Add: "⊕" / "⊖" buttons OR single compact slider
- Behavior: Same 0.5–1.0 range, emits same events as Settings

**Step 3.2** → Test menu interactions
- No breaking of mode selector dropdown
- No resize glitches when adjusting opacity
- Same event syncing as Settings controls

✅ **Checkpoint:** Quick opacity adjustment available from main bar (optional)

---

### ✅ **Phase 4: Test All Scenarios (Validation)**
**Test Matrix:**
- [ ] Single window: TopBar alone
- [ ] TopBar + Response (Chat Mode)
- [ ] TopBar + Response (Agent Mode)
- [ ] TopBar + Settings
- [ ] All three windows + rapid changes
- [ ] Change opacity, close window, reopen → verify persisted
- [ ] Startup with stored opacity prefs
- [ ] Startup with corrupted localStorage (fallback to defaults)
- [ ] Two monitors: set opacity, move window → verify applied on new monitor
- [ ] Opacity at 0.5 (near transparent), 1.0 (fully opaque), 0.75 (mid)
- [ ] Rapid opacity changes (stress test)

---

### ✅ **Phase 5: Code Cleanup & Review**
**Checklist:**
- [ ] Remove `console.log("Agent Mode JSX rendered")` from ResponseWindowUI
- [ ] Remove any debug Tauri event listeners
- [ ] Verify all `useEffect` dependencies are explicit
- [ ] Verify all async/await operations complete before DOM update
- [ ] Verify all Tauri API calls have try/catch
- [ ] Run ESLint + Prettier on all modified files
- [ ] Zero console errors/warnings in DevTools
- [ ] No orphaned HTML tags or unclosed divs

---

## 6. ROOT CAUSE PREVENTION CHECKLIST

| Issue | Root Cause | Prevention | File(s) |
|-------|-----------|-----------|---------|
| Opacity isolated to one window | No shared state | Create `desktopState.ts` first | Phase 1, Step 1.1 |
| No cross-window effect | No event broadcasting | Implement `"ira:opacity-changed"` | Phase 1, Step 1.2 |
| Settings lost on restart | No localStorage | Save prefs on change | Phase 2, Step 2.3 |
| Async race conditions | setOpacity() before window ready | Use useLayoutEffect or post-creation | Phase 1, Step 1.3 |
| Silent failures | No error handling | Wrap Tauri calls in try/catch | Phase 1, Step 1.3 |
| Debug code in production | Incomplete refactoring | Remove `console.log()` JSX | Phase 5 |
| Orphaned HTML tags | Copy-paste errors | ESLint validation | Phase 5 |
| Missing dependencies | Stale closures | Explicit useEffect deps | Phase 5 |

---

## 7. SUCCESS CRITERIA

✅ **Functional:**
- Opacity adjustable 0.5–1.0 for each of 3 windows independently
- Settings apply changes in real-time to target windows
- Changes visible immediately without restart
- Settings persist after app restart

✅ **Technical:**
- No console errors or warnings related to opacity
- All Tauri API calls have error handling
- All async operations properly awaited
- ESLint + Prettier validation passes
- No memory leaks from event listeners (cleanup in useEffect return)

✅ **UX:**
- Smooth transitions (use CSS transitions where possible)
- Opacity controls easily discoverable in Settings
- Quick-adjust buttons on TopBar (if implemented)
- Multi-monitor setups work correctly
- No visual artifacts or rendering glitches

✅ **Robustness:**
- Works with missing/corrupted localStorage
- Works with stale window refs
- Works when windows close unexpectedly
- Works in DevMode and Production builds

---

## 8. DECISION TREE: Architecture Approach

```
Decision: Shared State Implementation

A. Context API (Recommended)
   ✓ Pros:  React-native, no external deps, easy to access anywhere
   ✗ Cons:  Context re-renders subscribers, may not be ideal for frequent updates
   → Use if: Opacity changes < 1x per second (normal slider usage)

B. Custom Module (Recommended for Low-Latency)
   ✓ Pros:  Direct state, no re-render overhead, simple to debug
   ✗ Cons:  Must manually wire event listeners to React components
   → Use if: Need high-frequency updates or performance critical

C. Zustand/Redux (Overkill)
   ✗ Cons:  Extra dependency, too much boilerplate for simple state
   → Avoid: Complexity not justified

RECOMMENDATION: Context API + Custom Module
- Use desktopState.ts as single source of truth
- Wrap in Context for easy access in components
- Export hooks: useWindowOpacity(), useOpacityBroadcast()
- Import hooks in ExactIraUI, ResponseWindowUI, SettingsWindowUI
```

---

## 9. KNOWN QUIRKS & EDGE CASES

### Quirk 1: Settings Window Height Calculation
```typescript
// ExactIraUI.tsx:79-86
const calc = Math.floor(workBottomLogical - top);
h = Math.max(480, Math.min(calc, 960));  // Height clamped between 480–960px
```
**Note:** Settings window height is dynamic. Opacity changes should not affect height calculation.

### Quirk 2: Response Window Must Be Opaque
```typescript
// ExactIraUI.tsx:165 comment: "Opaque webview so the pink panel can align 1:1 with the window"
transparent: false,  // DO NOT CHANGE — affects layout
backgroundColor: theme.windowBg,
```
**Note:** Response window will remain `transparent: false` at Tauri level, but `setOpacity()` can still adjust visual opacity.

### Quirk 3: Popover Opacity vs Window Opacity
Popover is a styled `<div>` inside the Response window. Its opacity (CSS `opacity` property) is independent of window opacity. Both may be adjustable.

### Quirk 4: Dropdowns on TopBar
TopBar has a mode dropdown menu. Opacity changes should:
- Apply to entire TopBar including dropdown
- Not interfere with pointer events or hover states
- Not resize dropdown bounds

---

## 10. VALIDATION CHECKLIST (Before Deployment)

- [ ] **Phase 1 Complete:** desktopState.ts created, event infrastructure in place, no UI
- [ ] **Phase 2 Complete:** Settings UI controls visible, opacity adjustable, persists
- [ ] **Phase 3 Complete (optional):** TopBar quick-adjust working if implemented
- [ ] **Phase 4 Complete:** All test scenarios passing, no regressions
- [ ] **Phase 5 Complete:** Code cleanup, ESLint passing, zero console errors
- [ ] **No breaking changes:** Original features (Chat/Agent mode, Settings, Auth) still work
- [ ] **Startup behavior:** App starts with saved preferences or sensible defaults
- [ ] **Multi-window:** All windows opacity controlled independently
- [ ] **Persistence:** Settings survive app restart
- [ ] **Performance:** No frame drops, smooth slider interaction
- [ ] **Team review:** Code reviewed and approved before merge

---

## FINAL SUMMARY

| Aspect | Finding |
|--------|---------|
| **Root Cause** | Isolated state + no event broadcasting + no persistence |
| **Architecture Fix** | Shared opacity state module + Tauri event system + localStorage |
| **Files to Change** | 4 core (ExactIraUI, ResponseWindowUI, SettingsWindowUI, WindowRouter) + optionals (TopBar, theme) |
| **Complexity** | Low-Medium (straightforward state sync + event system) |
| **Risk Level** | Low (changes are additive, don't break existing logic) |
| **Implementation Time** | ~4–6 hours (with proper testing) |
| **Testing Time** | ~2–3 hours (multi-scenario matrix) |
| **Total Estimate** | ~6–9 hours |

---

## NEXT STEPS

1. ✅ **Review this analysis** — Confirm requirements match expectations
2. ✅ **Approve Phase 1 approach** — Shared state + events before UI
3. ✅ **Create desktopState.ts** — Single source of truth
4. ✅ **Begin Phase 1 implementation** — Non-breaking infrastructure
5. ✅ **Test Phase 1** — Verify event system works
6. ✅ **Proceed to Phase 2** — Add UI controls
7. ✅ **Full test matrix** — All scenarios before commit

---

**Report Generated:** April 7, 2026  
**Status:** ANALYSIS ONLY — Ready for implementation planning
