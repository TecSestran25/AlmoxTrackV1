import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.NEXT_PUBLIC_CLOUDINARY_API_SECRET,
});

export async function POST(request: Request) {
  const { base64, fileName } = await request.json();

  if (!base64 || !fileName) {
    return NextResponse.json({ message: 'Imagem ou nome do arquivo faltando.' }, { status: 400 });
  }

  try {
    const uploadResponse = await cloudinary.uploader.upload(base64, {
      public_id: fileName.split('.')[0],
      folder: 'almox-track',
    });

    return NextResponse.json({ url: uploadResponse.secure_url });
  } catch (error) {
    console.error('Erro no upload para o Cloudinary:', error);
    return NextResponse.json({ message: 'Erro ao fazer upload da imagem.' }, { status: 500 });
  }
}