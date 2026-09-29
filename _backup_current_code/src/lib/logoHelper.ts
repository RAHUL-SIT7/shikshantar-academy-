const logoImage = '/logo.png';

let cachedLogoBase64: string | null = null;

/**
 * Loads the official school logo and converts it to a base64 DataURL
 * suitable for embedding directly into jsPDF instances via pdf.addImage(...)
 */
export const getSchoolLogoBase64 = async (): Promise<string | null> => {
  if (cachedLogoBase64) {
    return cachedLogoBase64;
  }

  // Strategy 0: Node.js environment fallback (FS read of public/logo.png)
  if (typeof window === 'undefined') {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const logoPath = path.join(process.cwd(), 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const buf = fs.readFileSync(logoPath);
        const b64 = `data:image/png;base64,${buf.toString('base64')}`;
        cachedLogoBase64 = b64;
        return b64;
      }
    } catch {
      // Continue to browser strategies
    }
  }

  const sources = [logoImage, '/logo.png'];

  for (const src of sources) {
    if (!src) continue;

    // Strategy 1: HTML Image + Canvas rasterization
    try {
      const base64 = await new Promise<string | null>((resolve) => {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = src;

        const timer = setTimeout(() => {
          resolve(null);
        }, 1500);

        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 200;
            canvas.height = img.naturalHeight || 200;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              resolve(dataUrl);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
      });

      if (base64) {
        cachedLogoBase64 = base64;
        return base64;
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 2: Fetch + FileReader
    try {
      const resp = await fetch(src);
      if (resp.ok) {
        const blob = await resp.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (base64) {
          cachedLogoBase64 = base64;
          return base64;
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null;
};
