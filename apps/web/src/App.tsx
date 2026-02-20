import { CardBrowser } from "@/components/CardBrowser";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

function App() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <CardBrowser />
      </main>
      <Footer />
    </div>
  );
}

export default App;
