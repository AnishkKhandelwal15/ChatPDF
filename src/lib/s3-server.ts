import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";
import { pipeline } from "stream";

const pipe = promisify(pipeline);

// ✅ Create S3 client
const s3 = new S3Client({
    region: "ap-south-1",
    credentials: {
        accessKeyId: process.env.NEXT_PUBLIC_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.NEXT_PUBLIC_S3_SECRET_ACCESS_KEY!,
    },
});

export async function downloadFromS3(file_key: string) {
    try {
        const params = {
            Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME!,
            Key: file_key,
        };

        const command = new GetObjectCommand(params);
        const response = await s3.send(command);

        // ✅ FIX: Use os.tmpdir() for cross-platform temporary storage
        const tmpDir = os.tmpdir();
        const filePath = path.join(tmpDir, `pdf-${Date.now()}.pdf`);

        if (!response.Body) {
            throw new Error("S3 response body is empty");
        }

        // ✅ FIX: Stream file to disk instead of loading it into memory
        const fileStream = fs.createWriteStream(filePath);
        await pipe(response.Body as NodeJS.ReadableStream, fileStream);

        return filePath;

    } catch (error) {
        console.error("Error downloading from S3:", error);
        return null;
    }
}
