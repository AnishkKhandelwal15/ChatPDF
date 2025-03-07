import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import { Document, RecursiveCharacterTextSplitter } from "@pinecone-database/doc-splitter";
import { downloadFromS3 } from "./s3-server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { getEmbeddings } from "./embeddings";
import md5 from "md5";
import { convertToAscii } from "./utils";

// Define your metadata shape
interface PdfMetadata {
  pageNumber: number;
  text: string;
}

// Extend Document type
type PdfDocument = Document & { metadata: PdfMetadata };

let pinecone: Pinecone | null = null;
const INDEX_NAME = "chatpdf"; // ✅ Fixed index name (case-sensitive)

export const getPineconeClient = async () => {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  }
  return pinecone;
};

type PDFPage = {
  pageContent: string;
  metadata: { loc: { pageNumber: number } };
};

export async function loadS3IntoPinecone(file_key: string) {
  const file_name = await downloadFromS3(file_key);
  if (!file_name) throw new Error("Could not download file from S3");

  const loader = new PDFLoader(file_name);
  const pages = (await loader.load()) as PDFPage[];
  console.log("PDF pages loaded:", pages.length); // Debug log
  const documents = await Promise.all(pages.map(prepareDocument));
  const flatDocuments = documents.flat();
  console.log("Documents prepared:", flatDocuments.length); // Debug log

  const vectors = await Promise.all(flatDocuments.map(embedDocument));
  console.log("Vectors generated:", vectors.length); // Debug log
  const client = await getPineconeClient();
  const pineconeIndex = client.Index(INDEX_NAME);

  const namespace = convertToAscii(file_key);
  console.log(`📌 Upserting ${vectors.length} vectors into Pinecone...`);
  await chunkedUpsert(pineconeIndex, vectors, namespace, 10);

  return flatDocuments[0];
}

async function chunkedUpsert(
  index: ReturnType<Pinecone["Index"]>,
  vectors: PineconeRecord[],
  namespace: string,
  chunkSize: number
) {
  for (let i = 0; i < vectors.length; i += chunkSize) {
    const chunk = vectors.slice(i, i + chunkSize);
    try {
      console.log(`🚀 Upserting chunk of size ${chunk.length}...`);
      await index.namespace(namespace).upsert(chunk);
    } catch (error) {
      console.error("❌ Upsert error:", error);
      throw error;
    }
  }
}

async function embedDocument(doc: PdfDocument): Promise<PineconeRecord> {
  try {
    const embeddings = await getEmbeddings(doc.pageContent);
    const hash = md5(doc.pageContent);
    return {
      id: hash,
      values: embeddings,
      metadata: {
        pageNumber: doc.metadata.pageNumber,
        text: doc.metadata.text,
      },
    };
  } catch (error) {
    console.error("❌ Error embedding document:", error);
    throw error;
  }
}

export const truncateStringByBytes = (str: string, bytes: number) => {
  const enc = new TextEncoder();
  return new TextDecoder("utf-8").decode(enc.encode(str).slice(0, bytes));
};

async function prepareDocument(page: PDFPage): Promise<PdfDocument[]> {
  let { pageContent, metadata } = page;
  pageContent = pageContent.replace(/\n/g, " ");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // Smaller chunks for more granularity
    chunkOverlap: 200, // Overlap to retain context
  });
  const docs = await splitter.splitDocuments([
    new Document({
      pageContent,
      metadata: {
        pageNumber: metadata.loc.pageNumber,
        text: truncateStringByBytes(pageContent, 36000),
      },
    }),
  ]);
  console.log("Split documents for page:", docs.length); // Debug log
  return docs as PdfDocument[];
}
