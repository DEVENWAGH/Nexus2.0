import {
    generateUploadButton,
    generateUploadDropzone,
    generateReactHelpers,
} from "@uploadthing/react";

import type { OurFileRouter } from "@/app/api/uploadthing/core";

export const UploadButton: ReturnType<
    typeof generateUploadButton<OurFileRouter>
> = generateUploadButton<OurFileRouter>();
export const UploadDropzone: ReturnType<
    typeof generateUploadDropzone<OurFileRouter>
> = generateUploadDropzone<OurFileRouter>();

export const { uploadFiles } = generateReactHelpers<OurFileRouter>();
