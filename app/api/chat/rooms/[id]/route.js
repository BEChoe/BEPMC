import { NextResponse } from 'next/server';
const ragService = require('../../../../../services/ragService');

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'guest';
    const room = await ragService.getRoom(id, userId);
    if (!room) {
      return NextResponse.json({ success: false, message: '채팅방을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, room });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'guest';
    const result = await ragService.deleteRoom(id, userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
