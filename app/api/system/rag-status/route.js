import { NextResponse } from 'next/server';
import ragService from '@/services/ragService';

export async function GET() {
  try {
    const metrics = ragService.getSystemRAGMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
