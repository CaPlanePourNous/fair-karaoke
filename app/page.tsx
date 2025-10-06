// app/page.tsx
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px" }}>
      <h1>🎤 Fair Karaoke</h1>
      <p>Choisis une page :</p>
      <ul>
        <li>
          <a href="/room/lantignie">Room — Lantignié (inscription + recherche)</a>
        </li>
        <li>
          <a href="/host/lantignie">Host — Lantignié (tableau de bord)</a>
        </li>
      </ul>
      <p style={{opacity:.8, fontSize:14}}>
        En prod, remplace <code>/lantignie</code> par le slug de ta salle.
      </p>
    </main>
  );
}
