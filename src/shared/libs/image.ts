import sharp from 'sharp';

export const prepareImage = async (
  input: Buffer,
  options: { maxPixels: number; maxDimension: number; quality: number },
) => {
  const image = sharp(input, { limitInputPixels: options.maxPixels, failOn: 'warning', animated: true });
  const metadata = await image.metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
    throw new Error('Unsupported image format');
  }
  return image
    .rotate()
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: options.quality })
    .toBuffer();
};
