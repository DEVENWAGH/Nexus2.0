/**
 * File Security & Malicious Code Execution Prevention
 * Restricts executable, script, and auto-running files across all platform channels.
 */

export const BLOCKED_EXECUTABLE_EXTENSIONS = new Set<string>([
    // Windows executables & libraries
    "exe", "dll", "com", "scr", "msi", "msp", "sys", "cpl", "pif", "drv", "ocx",
    // Shell scripts & command files (Windows & POSIX)
    "bat", "cmd", "ps1", "ps1xml", "ps2", "psc1", "psc2", "vbs", "vbe", "wsf", "wsh", "sct", "vb", "ws",
    "sh", "bash", "zsh", "csh", "ksh", "command", "run", "bin", "out",
    "reg", "inf", "ins", "isp", "job", "msc", "mst",
    // Native packages & application bundles
    "app", "deb", "rpm", "dmg", "pkg", "apk", "ipa", "dylib", "so", "crx", "xpi",
    // Active web scripts & markups that execute in browser context (stored XSS / auto-execution)
    "html", "htm", "xhtml", "shtml", "mhtml", "hta", "svg", "xml", "wasm",
    // Source code / Scripting languages that could contain auto-run or malicious code
    "js", "mjs", "cjs", "jsx", "ts", "tsx",
    "py", "pyw", "pyc", "pyo", "pyd",
    "rb", "pl", "pm", "cgi",
    "php", "php3", "php4", "php5", "phtml", "phps",
    "asp", "aspx", "jsp", "jspx",
    "jar", "class", "dex", "swf", "air",
    "c", "cpp", "h", "hpp", "cs", "go", "rs", "swift", "kt", "kts", "lua", "tcl",
    // Macro-enabled Office files
    "docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppam", "ppsm", "sldm",
    // Disk images & shortcuts
    "iso", "img", "vhd", "vhdx", "lnk", "url", "gadget", "diagcab"
]);

export const BLOCKED_MIME_TYPES = new Set<string>([
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/x-dosexec",
    "application/x-executable",
    "application/x-sharedlib",
    "application/x-bat",
    "application/x-sh",
    "application/x-shellscript",
    "application/x-csh",
    "application/javascript",
    "application/x-javascript",
    "text/javascript",
    "application/ecmascript",
    "text/ecmascript",
    "application/x-python",
    "text/x-python",
    "application/x-python-code",
    "application/x-php",
    "text/x-php",
    "application/x-httpd-php",
    "text/html",
    "application/xhtml+xml",
    "application/x-msi",
    "application/x-vbs",
    "text/vbscript",
    "application/x-powershell",
    "application/java-archive",
    "application/x-java-archive",
    "application/vnd.android.package-archive",
    "application/x-apple-diskimage",
    "application/x-msmetafile",
    "application/hta",
    "image/svg+xml",
    "text/xml",
    "application/xml",
    "application/wasm",
]);

/** Unicode direction override characters used in spoofing attacks (e.g. Right-to-Left override \u202E) */
const SUSPICIOUS_UNICODE_CHARS = /[\u202A-\u202E\u2066-\u2069]/;

export interface FileSecurityCheckResult {
    safe: boolean;
    reason?: string;
}

/**
 * Checks if a filename has an executable or dangerous extension,
 * including multi-extension spoofing attempts (e.g. invoice.pdf.exe or file.exe.pdf).
 * Handles raw filenames, directory paths, and full URLs.
 */
export function isDangerousFilename(filename: string): FileSecurityCheckResult {
    if (!filename || typeof filename !== "string") {
        return { safe: false, reason: "Invalid filename" };
    }

    const trimmed = filename.trim();
    if (!trimmed) {
        return { safe: false, reason: "Filename cannot be empty" };
    }

    if (SUSPICIOUS_UNICODE_CHARS.test(trimmed)) {
        return { safe: false, reason: "Filename contains illegal control or override characters" };
    }

    if (trimmed.includes("%00") || trimmed.includes("\0")) {
        return { safe: false, reason: "Filename contains null byte injection sequence" };
    }

    // Extract filename if a full URL or directory path is passed
    let cleanName = trimmed;
    try {
        if (cleanName.includes("://")) {
            const urlObj = new URL(cleanName);
            // Check query parameters if filename or name is provided (e.g. ?filename=virus.exe)
            const queryParamFilename = urlObj.searchParams.get("filename") || urlObj.searchParams.get("name");
            if (queryParamFilename) {
                const queryCheck = isDangerousFilename(queryParamFilename);
                if (!queryCheck.safe) return queryCheck;
            }
            const pathParts = urlObj.pathname.split("/").filter(Boolean);
            cleanName = pathParts[pathParts.length - 1] || "";
        } else {
            cleanName = cleanName.split("?")[0]?.split("#")[0] ?? cleanName;
            const segments = cleanName.split(/[/\\]/).filter(Boolean);
            cleanName = segments[segments.length - 1] || cleanName;
        }
    } catch {
        cleanName = cleanName.split("?")[0]?.split("#")[0] ?? cleanName;
        const segments = cleanName.split(/[/\\]/).filter(Boolean);
        cleanName = segments[segments.length - 1] || cleanName;
    }

    const parts = cleanName.toLowerCase().split(".").filter(Boolean);

    if (parts.length <= 1) {
        // No extension provided — check if dangerous by matching known executable binary names
        return { safe: true };
    }

    // Check all extension parts to catch double-extension spoofing (e.g. "image.png.exe" or "doc.vbs.pdf")
    for (let i = 1; i < parts.length; i++) {
        const ext = parts[i];
        if (ext && BLOCKED_EXECUTABLE_EXTENSIONS.has(ext)) {
            return {
                safe: false,
                reason: `Files with extension '.${ext}' are blocked. Executable, script, and auto-run files are not supported.`,
            };
        }
    }

    return { safe: true };
}

/**
 * Checks if the MIME type is in the blocked executable/script list.
 */
export function isDangerousMimeType(mimeType?: string | null): FileSecurityCheckResult {
    if (!mimeType) return { safe: true };

    const normalized = mimeType.toLowerCase().trim().split(";")[0]?.trim();
    if (!normalized) return { safe: true };

    if (BLOCKED_MIME_TYPES.has(normalized)) {
        return {
            safe: false,
            reason: `MIME type '${normalized}' is restricted because it represents an executable, script, or active document.`,
        };
    }

    return { safe: true };
}

/**
 * Inspects initial bytes (Magic Numbers) for executable signatures,
 * detecting disguised executables that have had their extension renamed.
 */
export function hasExecutableMagicBytes(bytes: Uint8Array): FileSecurityCheckResult {
    if (bytes.length < 2) return { safe: true };

    // Windows PE / DOS Executable: MZ (0x4D, 0x5A)
    if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
        return { safe: false, reason: "Executable binary detected (Windows PE / DOS header)" };
    }

    // Linux ELF: 0x7F 'E' 'L' 'F'
    if (
        bytes.length >= 4 &&
        bytes[0] === 0x7f &&
        bytes[1] === 0x45 &&
        bytes[2] === 0x4c &&
        bytes[3] === 0x46
    ) {
        return { safe: false, reason: "Executable binary detected (Linux ELF header)" };
    }

    // WebAssembly binary: \0asm (0x00, 0x61, 0x73, 0x6D)
    if (
        bytes.length >= 4 &&
        bytes[0] === 0x00 &&
        bytes[1] === 0x61 &&
        bytes[2] === 0x73 &&
        bytes[3] === 0x6d
    ) {
        return { safe: false, reason: "Executable binary detected (WebAssembly module header)" };
    }

    // Mach-O / Java Class: 0xCA 0xFE 0xBA 0xBE
    if (
        bytes.length >= 4 &&
        bytes[0] === 0xca &&
        bytes[1] === 0xfe &&
        bytes[2] === 0xba &&
        bytes[3] === 0xbe
    ) {
        return { safe: false, reason: "Executable bytecode detected (Java class / Mach-O universal binary)" };
    }

    // Mach-O binaries: 0xFE 0xED 0xFA 0xCE or 0xCF or reverse
    if (
        bytes.length >= 4 &&
        ((bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa && (bytes[3] === 0xce || bytes[3] === 0xcf)) ||
            ((bytes[0] === 0xce || bytes[0] === 0xcf) && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe))
    ) {
        return { safe: false, reason: "Executable binary detected (Mach-O binary)" };
    }

    // Shell script / Script Shebang: #! (0x23, 0x21)
    if (bytes[0] === 0x23 && bytes[1] === 0x21) {
        return { safe: false, reason: "Executable script detected (Shebang header '#!')" };
    }

    // Windows Shortcut (.lnk): 0x4C 0x00 0x00 0x00 0x01 0x14 0x02 0x00
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x4c &&
        bytes[1] === 0x00 &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x00 &&
        bytes[4] === 0x01 &&
        bytes[5] === 0x14 &&
        bytes[6] === 0x02 &&
        bytes[7] === 0x00
    ) {
        return { safe: false, reason: "Windows shortcut file (.lnk) detected" };
    }

    // Text-based script / HTML payload inspection in initial 512 bytes
    try {
        const textSample = new TextDecoder("utf-8", { fatal: false })
            .decode(bytes.slice(0, Math.min(bytes.length, 512)))
            .toLowerCase();

        if (
            textSample.includes("<script") ||
            textSample.includes("javascript:") ||
            textSample.includes("vbscript:") ||
            textSample.includes("<?php") ||
            textSample.includes("<%@") ||
            textSample.includes("<%") ||
            textSample.includes("@echo") ||
            textSample.includes("powershell") ||
            textSample.includes("cmd.exe") ||
            textSample.includes("cscript") ||
            textSample.includes("wscript") ||
            textSample.includes("mshta") ||
            textSample.includes("<iframe") ||
            textSample.includes("<object") ||
            textSample.includes("<embed") ||
            (textSample.includes("<svg") && (
                textSample.includes("<script") ||
                textSample.includes("onload=") ||
                textSample.includes("onerror=") ||
                textSample.includes("onclick=")
            ))
        ) {
            return { safe: false, reason: "Embedded script or active code payload detected" };
        }
    } catch {
        // Non-decodable binary, continue
    }

    return { safe: true };
}

/**
 * Validates an ArrayBuffer or File chunk for security.
 */
export async function validateBufferSecurity(
    buffer: ArrayBuffer,
    filename?: string,
    mimeType?: string,
): Promise<FileSecurityCheckResult> {
    if (filename) {
        const nameCheck = isDangerousFilename(filename);
        if (!nameCheck.safe) return nameCheck;
    }

    if (mimeType) {
        const mimeCheck = isDangerousMimeType(mimeType);
        if (!mimeCheck.safe) return mimeCheck;
    }

    const initialBytes = new Uint8Array(buffer.slice(0, 512));
    const magicCheck = hasExecutableMagicBytes(initialBytes);
    if (!magicCheck.safe) return magicCheck;

    return { safe: true };
}
