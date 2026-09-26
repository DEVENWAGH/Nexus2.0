import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-wrapper";
import { validateUploadedFile, sanitizeFilename } from "@/lib/file-security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const { userId } = await getAuth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof Blob)) {
            return new NextResponse("No file uploaded", { status: 400 });
        }

        const endpoint = (formData.get("endpoint") as "imageUploader" | "messageFile") || "messageFile";
        const declaredName = (file as any).name || "";

        // Enforce file security: reject executable, script, and auto-running files
        const securityCheck = await validateUploadedFile(file, endpoint, declaredName);
        if (!securityCheck.safe) {
            return NextResponse.json(
                { error: securityCheck.reason || "File rejected: Executable and malicious files are restricted." },
                { status: 400 }
            );
        }

        const pinataApiKey = process.env.PINATA_API_KEY;
        const pinataApiSecret = process.env.PINATA_API_SECRET;

        if (!pinataApiKey || !pinataApiSecret) {
            console.error("Missing Pinata API configuration in environment variables");
            return new NextResponse("Server misconfigured", { status: 500 });
        }

        const safeFilename = sanitizeFilename(declaredName || "attachment");

        // Prepare the multipart form data for Pinata API
        const pinataForm = new FormData();
        pinataForm.append("file", file, safeFilename);

        const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: {
                pinata_api_key: pinataApiKey,
                pinata_secret_api_key: pinataApiSecret,
            },
            body: pinataForm,
        });

        if (!pinataResponse.ok) {
            const errorText = await pinataResponse.text();
            console.error("Pinata upload failed:", errorText);
            return new NextResponse(`Failed to upload to Pinata: ${pinataResponse.statusText}`, { status: 500 });
        }

        const pinataData = await pinataResponse.json();
        const ipfsHash = pinataData.IpfsHash;

        if (!ipfsHash) {
            console.error("Pinata response missing IpfsHash:", pinataData);
            return new NextResponse("Invalid response from Pinata", { status: 500 });
        }

        const url = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
        return NextResponse.json({ url });
    } catch (error) {
        console.error("[UPLOAD_ERROR]", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
