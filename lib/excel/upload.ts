import { upload } from "@vercel/blob/client";

export async function attachWorkbook(form: FormData, file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw Error("Upload an .xlsx workbook.");
  if (file.size > 30 * 1024 * 1024)
    throw Error("Source file exceeds the 30 MB limit.");
  const config = await fetch("/api/uploads").then((r) => r.json());
  if (!config.hosted) {
    form.set("file", file);
    return;
  }
  const blob = await upload(`uploads/${crypto.randomUUID()}.xlsx`, file, {
    access: "private",
    handleUploadUrl: "/api/uploads",
    multipart: true,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  form.delete("file");
  form.set("uploadedPath", blob.pathname);
  form.set("sourceName", file.name);
}
