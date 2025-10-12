// middleware.ts (racine du projet)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/host', '/api/host']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  const pass = process.env.HOST_PASS
  if (!pass) {
    // Tu préfères échouer fort si non configuré
    return new NextResponse('HOST_PASS not set', { status: 500 })
  }

  // 1) Cookie déjà posé ?
  const cookieOk = req.cookies.get('host_auth')?.value === 'ok'
  if (cookieOk) return NextResponse.next()

  // 2) Authorization: Basic xxxx (user facultatif, seul mot de passe est vérifié)
  const auth = req.headers.get('authorization') || ''
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.replace('Basic ', ''), 'base64').toString('utf8')
      // formats tolérés: "user:pass" ou ":pass" ou "pass"
      const parts = decoded.split(':')
      const provided = parts.length === 1 ? parts[0] : parts.slice(1).join(':')
      if (provided === pass) {
        const res = NextResponse.next()
        res.cookies.set('host_auth', 'ok', {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 8, // 8h
        })
        return res
      }
    } catch {
      /* ignore */
    }
  }

  // 3) 401 + challenge
  const res = new NextResponse('Unauthorized', { status: 401 })
  res.headers.set('WWW-Authenticate', 'Basic realm="Fair-Karaoke Host", charset="UTF-8"')
  return res
}

export const config = {
  matcher: ['/host/:path*', '/api/host/:path*'],
}
