/* Mailwerk.exe – startet Mailwerk mit der mitgelieferten Java-Laufzeit, ohne Konsolenfenster. */
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <wchar.h>

/* Argumente hinter dem Programmnamen (z. B. --minimized beim Autostart) */
static const wchar_t *args_after_program(void) {
    const wchar_t *c = GetCommandLineW();
    if (*c == L'"') { c++; while (*c && *c != L'"') c++; if (*c) c++; }
    else { while (*c && *c != L' ' && *c != L'\t') c++; }
    while (*c == L' ' || *c == L'\t') c++;
    return c;
}

int WINAPI WinMain(HINSTANCE h, HINSTANCE p, LPSTR unused, int show) {
    (void)h; (void)p; (void)unused; (void)show;
    const wchar_t *cmd = args_after_program();
    wchar_t exe[MAX_PATH], dir[MAX_PATH], javaw[MAX_PATH];
    GetModuleFileNameW(NULL, exe, MAX_PATH);
    wcscpy(dir, exe);
    wchar_t *slash = wcsrchr(dir, L'\\');
    if (slash) *slash = 0;
    swprintf(javaw, MAX_PATH, L"%ls\\jre\\bin\\javaw.exe", dir);
    if (GetFileAttributesW(javaw) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(NULL, L"Der Ordner \"jre\" fehlt neben Mailwerk.exe. Bitte die ZIP-Datei vollständig entpacken.", L"Mailwerk", MB_ICONERROR);
        return 1;
    }
    static wchar_t line[16384];
    swprintf(line, 16384,
        L"\"%ls\" -Xmx1024m -Dfile.encoding=UTF-8 -Dsun.java2d.dpiaware=true \"-Dmailwerk.exe=%ls\" -cp \"%ls\\lib\\*\" app.mailwerk.desktop.MainKt %ls",
        javaw, exe, dir, cmd);
    STARTUPINFOW si; PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof si); si.cb = sizeof si;
    if (!CreateProcessW(NULL, line, NULL, NULL, FALSE, 0, NULL, dir, &si, &pi)) {
        MessageBoxW(NULL, L"Mailwerk konnte nicht gestartet werden.", L"Mailwerk", MB_ICONERROR);
        return 1;
    }
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return 0;
}
