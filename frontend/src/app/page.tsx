import Navbar from "@/components/Navbar";
import HeroSection from "@/components/Herosection";
import AboutSection from "@/components/AboutSection";
import ServicesSection from "@/components/ServicesSection";
import DoctorsSection from "@/components/DoctorsSection";
import FacilitiesSection from "@/components/FacilitiesSection";
import NewsSection from "@/components/NewsSection";
import EmergencyCtaSection from "@/components/EmergencyCtaSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      <Navbar />
      <HeroSection />
      <AboutSection />
      <ServicesSection />
      <DoctorsSection />
      <FacilitiesSection />
      <NewsSection />
      <EmergencyCtaSection />
      <Footer />
    </main>
  );
}
