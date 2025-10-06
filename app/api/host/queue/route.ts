22:54:51.132 Running build in Washington, D.C., USA (East) – iad1
22:54:51.132 Build machine configuration: 2 cores, 8 GB
22:54:51.146 Cloning github.com/CaPlanePourNous/fair-karaoke (Branch: master, Commit: dd0c6fa)
22:54:51.860 Cloning completed: 714.000ms
22:54:52.543 Restored build cache from previous deployment (En1W5gSgYNcAqXUxrN7smraBabQy)
22:54:52.952 Running "vercel build"
22:54:53.326 Vercel CLI 48.2.0
22:54:53.626 Installing dependencies...
22:54:54.972 
22:54:54.973 up to date in 1s
22:54:54.974 
22:54:54.974 150 packages are looking for funding
22:54:54.974   run `npm fund` for details
22:54:55.002 Detected Next.js version: 15.5.3
22:54:55.006 Running "npm run build"
22:54:55.110 
22:54:55.110 > fair-karaoke@0.1.0 build
22:54:55.110 > next build
22:54:55.110 
22:54:56.162    ▲ Next.js 15.5.3
22:54:56.162 
22:54:56.233    Creating an optimized production build ...
22:55:02.846  ✓ Compiled successfully in 4.0s
22:55:02.851    Linting and checking validity of types ...
22:55:08.431 Failed to compile.
22:55:08.431 
22:55:08.431 ./app/api/host/play/route.ts:82:62
22:55:08.431 Type error: Expected 1 arguments, but got 2.
22:55:08.432 
22:55:08.432 [0m [90m 80 |[39m
22:55:08.432  [90m 81 |[39m       [36mconst[39m all [33m=[39m (rows [33m||[39m []) [36mas[39m [33mRow[39m[][33m;[39m
22:55:08.432 [31m[1m>[22m[39m[90m 82 |[39m       [36mconst[39m { orderedWaiting } [33m=[39m computeOrdering(all [36mas[39m any[33m,[39m { maxQueue[33m:[39m [35m15[39m })[33m;[39m
22:55:08.432  [90m    |[39m                                                              [31m[1m^[22m[39m
22:55:08.432  [90m 83 |[39m       id [33m=[39m orderedWaiting[[35m0[39m][33m;[39m [90m// newbies priorisés ici[39m
22:55:08.432  [90m 84 |[39m       [36mif[39m ([33m![39mid) [36mreturn[39m [33mNextResponse[39m[33m.[39mjson({ ok[33m:[39m [36mfalse[39m[33m,[39m error[33m:[39m [32m"Aucun titre en attente"[39m }[33m,[39m { status[33m:[39m [35m409[39m[33m,[39m headers[33m:[39m noStore })[33m;[39m
22:55:08.433  [90m 85 |[39m     }[0m
22:55:08.452 Next.js build worker exited with code: 1 and signal: null
22:55:08.472 Error: Command "npm run build" exited with 1s