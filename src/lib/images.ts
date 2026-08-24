export interface PreparedImage { blob: Blob; preview: string; fileName: string; mimeType: string; originalSize: number; width: number; height: number }
export async function prepareImage(file: File, maxDimension = 1920, quality = .82): Promise<PreparedImage> {
  if (!["image/jpeg","image/png"].includes(file.type)) throw new Error("Use uma fotografia JPG ou PNG.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Cada fotografia deve ter no máximo 20 MB.");
  const bitmap = await createImageBitmap(file); const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height)); const width = Math.round(bitmap.width * scale); const height = Math.round(bitmap.height * scale);
  const canvas=document.createElement("canvas"); canvas.width=width; canvas.height=height; canvas.getContext("2d")!.drawImage(bitmap,0,0,width,height); bitmap.close();
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Não foi possível preparar a imagem.")),"image/jpeg",quality));
  return { blob, preview: URL.createObjectURL(blob), fileName:file.name.replace(/\.[^.]+$/,".jpg"), mimeType:"image/jpeg", originalSize:file.size, width, height };
}
