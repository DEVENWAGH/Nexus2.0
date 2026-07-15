import { uploadFiles } from "@/lib/upload";
import {
    formatFileSize,
    MESSAGE_FILE_IMAGE_MAX_BYTES,
    UPLOAD_FILE_SIZES,
} from "@/lib/upload-limits";

/** Max dimension before steg encode — keeps PNG output under the upload cap. */
const MAX_STEG_DIMENSION = 2048;

/** Strip a data-URI prefix and return raw base64 payload. */
export function extractBase64(dataUrlOrB64: string): string {
    const trimmed = dataUrlOrB64.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.includes("base64,")) {
        return trimmed.split("base64,").pop()?.replace(/\s/g, "") ?? "";
    }
    if (trimmed.startsWith("data:")) {
        return trimmed.split(",").pop()?.replace(/\s/g, "") ?? "";
    }
    return trimmed.replace(/\s/g, "");
}

export function encodedBase64ToFile(encodedB64: string, filename = "hidden_message.png"): File {
    const binary = atob(encodedB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, { type: "image/png" });
}

export function assertWithinMessageFileImageLimit(file: File): void {
    if (file.size > MESSAGE_FILE_IMAGE_MAX_BYTES) {
        throw new Error(
            `Encoded image is ${formatFileSize(file.size)}, but the upload limit is ${UPLOAD_FILE_SIZES.messageImage}. Try a smaller source image.`,
        );
    }
}

export async function uploadMessageFile(file: File): Promise<string> {
    const uploaded = await uploadFiles("messageFile", { files: [file] });
    const uploadedUrl = uploaded[0]?.ufsUrl ?? uploaded[0]?.url;
    if (!uploadedUrl) {
        throw new Error("Failed to upload file");
    }
    return uploadedUrl;
}

export async function uploadEncodedStegImage(encodedB64: string): Promise<string> {
    const encodedFile = encodedBase64ToFile(encodedB64);
    assertWithinMessageFileImageLimit(encodedFile);

    const uploaded = await uploadFiles("messageFile", { files: [encodedFile] });
    const uploadedUrl = uploaded[0]?.ufsUrl ?? uploaded[0]?.url;
    if (!uploadedUrl) {
        throw new Error("Failed to upload encoded image");
    }
    return uploadedUrl;
}

/** Downscale large images before steg encode to avoid oversized PNG output. */
export async function prepareImageFileForSteg(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) {
        return file;
    }

    const bitmap = await createImageBitmap(file);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    if (maxSide <= MAX_STEG_DIMENSION) {
        bitmap.close();
        return file;
    }

    const scale = MAX_STEG_DIMENSION / maxSide;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close();
        throw new Error("Could not prepare image for steganography");
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (result) =>
                result ? resolve(result) : reject(new Error("Failed to resize image for steganography")),
            "image/png",
            0.92,
        );
    });

    const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.png`;
    return new File([blob], name, { type: "image/png" });
}
