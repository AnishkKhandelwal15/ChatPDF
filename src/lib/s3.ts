import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: "ap-south-1",
    credentials: {
        accessKeyId: process.env.NEXT_PUBLIC_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.NEXT_PUBLIC_S3_SECRET_ACCESS_KEY!,
    },
});

export async function uploadToS3(file: File) {
    try {
        const fileBuffer = await file.arrayBuffer(); // Convert File to buffer
        const fileKey = `upload/${Date.now().toString()}-${file.name.replace(/\s/g, "-")}`;

        const params = {
            Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME!,
            Key: fileKey,
            Body: Buffer.from(fileBuffer),
            ContentType: file.type,
        };

        const command = new PutObjectCommand(params);
        await s3.send(command);

        return {
            file_key: fileKey, // ✅ Key used to retrieve file
            file_name: file.name, // ✅ Original filename
        };

    } catch (error) {
        console.error("S3 Upload Error:", error);
        return null;
    }
}

export function getS3Url(fileKey: string) {
    return `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.ap-south-1.amazonaws.com/${fileKey}`;
}
