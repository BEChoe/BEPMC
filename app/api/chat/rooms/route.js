import { NextResponse } from 'next/server';
const ragService = require('../../../../services/ragService');

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'guest';
    const rooms = await ragService.listRooms(userId);
    return NextResponse.json({ success: true, rooms });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || 'guest';
    const title = body.title || '새로운 안전 상담 대화';
    const room = await ragService.createRoom(userId, title);
    return NextResponse.json({ success: true, room });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
