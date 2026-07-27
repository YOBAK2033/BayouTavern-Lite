export function isImageSource(value?: string): boolean {
  return Boolean(value && /^(data:image\/|https?:\/\/|blob:)/i.test(value));
}

export function compressImage(file: File, targetWidth: number, targetHeight: number, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('请选择图片文件')); return; }
    if (file.size > 10 * 1024 * 1024) { reject(new Error('图片原文件不能超过 10MB')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片解码失败'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('图片处理不可用')); return; }
        const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function compressImageBlob(file: File, targetWidth: number, targetHeight: number, quality = 0.78): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('请选择图片文件')); return; }
    if (file.size > 10 * 1024 * 1024) { reject(new Error('图片原文件不能超过 10MB')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片解码失败'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('图片处理不可用')); return; }
        const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片压缩失败')), 'image/jpeg', quality);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
