import './globals.css';

export const metadata = {
  title: 'Suivi Brazza — plateformes & actions',
  description: 'Suivi des plateformes de travail en ligne et du plan d\'action pour l\'équipe de Brazzaville'
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
