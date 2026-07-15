export async function uploadFiles(
    endpoint: "imageUploader" | "messageFile",
    options: { files: File[] }
) {
    const results = [];
    for (const file of options.files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("endpoint", endpoint);

        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || "Failed to upload file");
        }

        const data = await response.json();
        if (!data.url) {
            throw new Error("Upload finished but no file URL was returned.");
        }
        results.push({ url: data.url, ufsUrl: data.url });
    }
    return results;
}
