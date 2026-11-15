import './globals.css';

export const metadata = {
  title: 'BEPSMC AI 안전 법규 & 제도 컨설턴트',
  description: '산업·철도 안전 관련 법규, 시행령, 고시 및 제도 실시간 AI 검색 & 상담 서비스',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
