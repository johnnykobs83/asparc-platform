import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="speed-lines flex min-h-screen flex-col items-center justify-center bg-charcoal px-6 text-center text-white">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-6xl uppercase">Page not found</h1>
      <Link href="/" className="btn-primary mt-8">Back to home</Link>
    </main>
  );
}
