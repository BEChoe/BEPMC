import { redirect } from 'next/navigation';

export default function HomePage() {
  // 메인 홈페이지(public/index.html)로 먼저 이동
  redirect('/index.html');
}
