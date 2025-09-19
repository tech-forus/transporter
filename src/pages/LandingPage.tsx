import React, { useState, useEffect, useRef } from 'react';
import { Mail, Zap, Target, DollarSign, Search, Briefcase, UserCheck, Phone } from 'lucide-react';

// --- Reusable Hook for Fade-in Animation ---
const useFadeIn = (options = { threshold: 0.1, triggerOnce: true }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsVisible(true);
    }, options);

    if (ref.current) observer.observe(ref.current);
    return () => {
      if (ref.current) observer.unobserve(ref.current as Element);
    };
  }, [options]);

  const style = {
    transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
  };

  return [ref, style] as const;
};

// --- Sub-components for better structure ---
const AnimatedSection: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const [ref, style] = useFadeIn();
  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
};

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
    <div className="flex items-center space-x-4">
      <div className="flex-shrink-0 bg-blue-100 text-blue-600 rounded-lg p-3">{icon}</div>
      <div>
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
        <p className="mt-1 text-gray-600">{children}</p>
      </div>
    </div>
  </div>
);

const StepCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; step: number }> = ({
  icon,
  title,
  children,
  step,
}) => (
  <div className="text-center relative">
    <div className="absolute -top-4 -left-4 bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center font-bold text-sm">
      {step}
    </div>
    <div className="flex items-center justify-center h-20 w-20 bg-gray-100 text-blue-600 rounded-full mx-auto shadow-inner">
      {icon}
    </div>
    <h3 className="mt-6 text-xl font-bold">{title}</h3>
    <p className="mt-2 text-gray-600">{children}</p>
  </div>
);

const TransporterLandingPage: React.FC = () => {
  // Use env var if present; fallback to a local route
  const SIGNUP_URL = (import.meta as any).env?.VITE_TRANSPORTER_SIGNUP_URL ?? '/signup';

  return (
    <div className="bg-gray-50 text-gray-800 antialiased">
      {/* --- Hero Section --- */}
      <header className="bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto py-24 px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight">
              Maximize Your Fleet&apos;s Potential.
              <br className="hidden md:block" />
              <span className="text-blue-600">Never Run Empty Again.</span>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg md:text-xl text-gray-600">
              Join India&apos;s leading bidding platform and get exclusive access to thousands of daily loads. Fill your
              trucks, optimize your routes, and boost your revenue—effortlessly.
            </p>

            {/* ACTIONS: Contact Us + Get Started */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a
                href="#contact-us"
                className="inline-block px-8 py-3 bg-blue-600 text-white text-base font-semibold rounded-lg shadow-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-300"
                aria-label="Contact Us"
              >
                Contact Us
              </a>

              {/* NEW Get Started button */}
              <a
                href={SIGNUP_URL}
                className="inline-block px-8 py-3 bg-white text-blue-700 border border-blue-600 text-base font-semibold rounded-lg shadow hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transform hover:scale-105 transition-all duration-300"
                aria-label="Get Started"
              >
                Get Started
              </a>
            </div>
          </AnimatedSection>
        </div>
        {/* Decorative background shapes */}
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-blue-50 rounded-full opacity-50"></div>
        <div className="absolute bottom-0 left-0 -mb-24 -ml-12 w-80 h-80 bg-gray-100 rounded-full opacity-60"></div>
      </header>

      {/* --- "Trusted By" Section --- */}
      <div className="py-12 bg-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">
              The Preferred Choice for India&apos;s Premier Logistics Networks
            </p>
            <div className="flex justify-around items-center space-x-4">
              <span className="text-2xl font-bold text-blue-800">bluedart</span>
              <span className="text-2xl font-bold text-red-600">delhivery</span>
              <span className="text-2xl font-bold text-orange-500">DTDC</span>
              <span className="text-2xl font-bold text-indigo-700">Gati</span>
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* --- How It Works Section --- */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">Get On the Road in 3 Simple Steps</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">
              Our streamlined process is designed for speed and efficiency, connecting your fleet to critical loads
              faster than ever before.
            </p>
          </AnimatedSection>
          <AnimatedSection className="mt-16 grid md:grid-cols-3 gap-16">
            <StepCard icon={<Search size={36} />} title="Discover Live Bids" step={1}>
              Browse a real-time marketplace of loads from verified shippers across the country.
            </StepCard>
            <StepCard icon={<Briefcase size={36} />} title="Place Your Bid" step={2}>
              Submit your most competitive offer. Our platform ensures a fair and transparent bidding process.
            </StepCard>
            <StepCard icon={<UserCheck size={36} />} title="Win & Ship" step={3}>
              Once your bid is accepted, you&apos;ll get instant confirmation and all the details to get moving.
            </StepCard>
          </AnimatedSection>
        </div>
      </section>

      {/* --- Why Partner With Us Section --- */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">The Advantage for Your Business</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">
              We provide the tools and opportunities to elevate your operations to the next level of profitability and
              efficiency.
            </p>
          </AnimatedSection>
          <AnimatedSection className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard icon={<DollarSign />} title="Increase Your Revenue">
              Gain access to a consistent stream of shipments to keep your trucks full and earning.
            </FeatureCard>
            <FeatureCard icon={<Zap />} title="Reduce Empty Miles">
              Find backhauls and fill last-minute capacity to dramatically improve your operational efficiency.
            </FeatureCard>
            <FeatureCard icon={<Target />} title="Optimize Routes">
              Pick and choose loads that align perfectly with your existing routes and fleet locations.
            </FeatureCard>
          </AnimatedSection>
        </div>
      </section>

      {/* --- Contact Us Section --- */}
      <section id="contact-us" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left Column: Info */}
              <div className="text-left">
                <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">Get in Touch</h2>
                <p className="mt-4 text-lg text-gray-600">
                  Have a question or need more information? Our partnership team is ready to assist you. Reach out to us
                  directly or use the form to send us a message.
                </p>
                <div className="mt-8 space-y-4">
                  <a
                    href="mailto:partners@example.com"
                    className="flex items-center text-lg text-gray-700 hover:text-blue-600 transition"
                  >
                    <Mail className="w-6 h-6 mr-3 text-blue-500" />
                    <span>partners@example.com</span>
                  </a>
                  <a href="tel:+911234567890" className="flex items-center text-lg text-gray-700 hover:text-blue-600 transition">
                    <Phone className="w-6 h-6 mr-3 text-blue-500" />
                    <span>+91 123-456-7890</span>
                  </a>
                </div>
              </div>

              {/* Right Column: Form */}
              <div className="bg-gray-50 p-8 rounded-lg shadow-md border border-gray-200">
                <form className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="name" className="sr-only">
                        Full Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        placeholder="Full Name"
                        className="w-full p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                      />
                    </div>
                    <div>
                      <label htmlFor="company" className="sr-only">
                        Company Name
                      </label>
                      <input
                        type="text"
                        id="company"
                        placeholder="Company Name"
                        className="w-full p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="email" className="sr-only">
                      Business Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      placeholder="Business Email Address"
                      className="w-full p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="message" className="sr-only">
                      Message
                    </label>
                    <textarea
                      id="message"
                      rows={4}
                      placeholder="Your message or question..."
                      className="w-full p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                    ></textarea>
                  </div>
                  <div>
                    <button
                      type="submit"
                      className="w-full py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-md hover:bg-blue-700 transform hover:scale-102 transition-all duration-300"
                    >
                      Send Message
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
};

export default TransporterLandingPage;
