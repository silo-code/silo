; Silo installer hooks — RFC 0053.
;
; Session hosts are detached processes that keep a terminal's shell alive while
; no window is attached. They deliberately outlive an app update: each runs from
; a staged copy under app-data (`session-host/<hash>/silo-session-host.exe`),
; not from $INSTDIR, so the installer has neither a reason nor a need to touch
; them. See `session_windows.rs`.
;
; An uninstall is the other case: there the sessions *should* go. Tauri's
; template used to provide that by accident — its running-app check matched
; every session host because they were all `silo.exe` — and this hook replaces
; that accident with an explicit, uninstall-only reap.

!macro NSIS_HOOK_PREUNINSTALL
  ; CRITICAL: the uninstaller also runs as a *step of an update* — the installer
  ; invokes the previous version's uninstaller with /UPDATE when the user picks
  ; the uninstall-first path on the "Already Installed" page. `un.onInit` has
  ; already parsed that into $UpdateMode by the time this hook fires. Killing
  ; unconditionally here would destroy every terminal on exactly the flow this
  ; RFC exists to fix, so the reap is gated on a genuine uninstall.
  ${If} $UpdateMode <> 1
    ; Session hosts are always per-user processes, so never reach across users.
    nsis_tauri_utils::KillProcessCurrentUser "silo-session-host.exe"
    Pop $0

    ; Drop the staged binaries. These are a content-addressed cache, not user
    ; data, so they go regardless of the "delete application data" choice —
    ; which otherwise leaves an app-sized copy behind after an uninstall.
    SetShellVarContext current
    RMDir /r "$APPDATA\${BUNDLEID}\session-host"
  ${EndIf}
!macroend
