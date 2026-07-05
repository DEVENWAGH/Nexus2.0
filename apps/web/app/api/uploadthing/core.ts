import { getAuth } from "@/lib/auth-wrapper";
import { UPLOAD_FILE_SIZES } from "@/lib/upload-limits";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

const f = createUploadthing();

const handleAuth = async () => {
    const { userId } = await getAuth();
    if (!userId) throw new UploadThingError("Unauthorized");
    return { userId };
};

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter: FileRouter = {
    imageUploader: f({
        image: {
            maxFileSize: UPLOAD_FILE_SIZES.serverIcon,
            maxFileCount: 1,
        },
    })
        .middleware(async () => {
            return await handleAuth();
        })
        .onUploadComplete(async ({ metadata }) => {
            return { uploadedBy: metadata.userId };
        }),
    messageFile: f({
        image: { maxFileSize: UPLOAD_FILE_SIZES.messageImage, maxFileCount: 1 },
        pdf: { maxFileSize: UPLOAD_FILE_SIZES.messagePdf, maxFileCount: 1 },
        video: { maxFileSize: UPLOAD_FILE_SIZES.messageVideo, maxFileCount: 1 },
        audio: { maxFileSize: UPLOAD_FILE_SIZES.messageAudio, maxFileCount: 1 },
    })
        .middleware(async () => {
            return await handleAuth();
        })
        .onUploadComplete(async ({ metadata }) => {
            return { uploadedBy: metadata.userId };
        }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
