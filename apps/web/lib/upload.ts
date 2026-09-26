import { validateUploadedFile } from "./file-security";

export async function uploadFiles(
    endpoint: "imageUploader" | "messageFile",
    options: { files: File[] }
) {
    const results = [];
    for (const file of options.files) {
        const securityCheck = await validateUploadedFile(file, endpoint);
        if (!securityCheck.safe) {
            throw new Error(securityCheck.reason || "Security violation: Executable and malicious files are blocked.");
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("endpoint", endpoint);

        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            let errorMsg = "Failed to upload file";
            try {
                const errData = await response.json();
                errorMsg = errData.error || errData.message || errorMsg;
            } catch {
                const errText = await response.text();
                errorMsg = errText || errorMsg;
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (!data.url) {
            throw new Error("Upload finished but no file URL was returned.");
        }
        results.push({ url: data.url, ufsUrl: data.url });
    }
    return results;
}
