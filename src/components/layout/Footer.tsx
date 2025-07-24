// src/components/layout/Footer.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, Twitter, Linkedin, Facebook, ArrowRight } from 'lucide-react';
import { motion, Variants } from 'framer-motion';

// --- Animated Background ---
const AnimatedWorldMap = () => (
    <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <motion.svg
            className="absolute -top-1/4 -left-1/4 h-[150%] w-[150%] text-gray-700/20"
            // The animation will slowly pan the background SVG
            initial={{ x: 0 }}
            animate={{ x: '-50%' }}
            transition={{ duration: 40, repeat: Infinity, repeatType: 'mirror', ease: 'linear' }}
        >
            {/* A simple world map SVG path - you can replace this with any pattern */}
            <path fill="currentColor" d="M1000 500q126 0 236 38t192 104q82 66 128 152t46 181q0 98-40 181t-113 147q-73 64-167 98t-196 34q-114 0-213-36t-173-100q-74-64-121-155t-47-190q0-109 49-204t135-154q86-59 191-89t215-30zm-1-500q139 0 259 44t203 124q84 80 133 181t49 220q0 120-56 226t-154 176q-98 70-218 108t-245 38q-138 0-259-42t-205-122q-84-80-132-181t-48-219q0-120 57-227t155-177q98-70 217-108t243-38z" />
        </motion.svg>
    </div>
);


// --- Enhanced, Reusable Components ---

const BrandLogo = () => (
  <Link to="/" className="flex items-center gap-2 flex-shrink-0">
    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
      <Truck className="w-6 h-6 text-white" />
    </div>
    <h1 className="text-2xl font-bold text-white">FreightCompare</h1>
  </Link>
);

const FooterLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="text-slate-400 hover:text-white hover:pl-1 transition-all duration-200 block">
    {children}
  </Link>
);

// New Component: System Status Link with live indicator
const SystemStatusLink = () => (
    <a href="#" className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors duration-200">
        <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        System Status
    </a>
);


const FooterSectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-sm font-semibold text-white/90 tracking-wider uppercase mb-5">
    {children}
  </h3>
);

const SocialIcon = ({ href, icon }: { href: string; icon: React.ReactNode }) => (
  <motion.a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-slate-400 hover:text-white"
    whileHover={{ scale: 1.2, y: -2 }}
    transition={{ type: 'spring', stiffness: 300 }}
  >
    {icon}
  </motion.a>
);

// Framer Motion Animation Variants
const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15, // This creates the staggered animation effect
        },
    },
};

const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: {
            type: 'spring',
            stiffness: 100,
        },
    },
};

// --- Main Footer Component ---

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative bg-[#111827] text-slate-300">
      <AnimatedWorldMap />
      
      {/* The z-10 ensures the content is on top of the animated background */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
            className="grid grid-cols-2 md:grid-cols-5 gap-12"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
        >
          {/* Column 1: Brand Info */}
          <motion.div className="col-span-2" variants={itemVariants}>
            <BrandLogo />
            <p className="mt-4 text-slate-400 leading-relaxed max-w-xs">
              Making smarter logistics decisions, effortlessly. Compare real-time quotes and save on every shipment.
            </p>
          </motion.div>

          {/* Column 2: Quick Links */}
          <motion.div className="col-span-1" variants={itemVariants}>
            <FooterSectionTitle>Quick Links</FooterSectionTitle>
            <div className="space-y-3">
              <FooterLink to="/aboutus">About Us</FooterLink>
              <FooterLink to="/features">Features</FooterLink>
              <FooterLink to="/contactus">Contact</FooterLink>
              <FooterLink to="/transporter-login">Transporter Login</FooterLink>
            </div>
          </motion.div>

          {/* Column 3: Resources */}
          <motion.div className="col-span-1" variants={itemVariants}>
            <FooterSectionTitle>Resources</FooterSectionTitle>
            <div className="space-y-3">
              <FooterLink to="/calculator">Calculator</FooterLink>
              <FooterLink to="/help-center">Help Center</FooterLink>
              <FooterLink to="/blog">Blog</FooterLink>
              <SystemStatusLink />
            </div>
          </motion.div>

          {/* Column 4: Legal */}
          <motion.div className="col-span-1" variants={itemVariants}>
            <FooterSectionTitle>Legal</FooterSectionTitle>
            <div className="space-y-3">
              <FooterLink to="/privacy">Privacy Policy</FooterLink>
              <FooterLink to="/terms">Terms of Service</FooterLink>
            </div>
          </motion.div>
        </motion.div>

        {/* Sub-Footer */}
        <div className="mt-16 pt-8 border-t border-slate-200/10 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-sm text-slate-500 text-center sm:text-left mb-4 sm:mb-0">
            © {currentYear} FreightCompare, Inc. All rights reserved.
          </p>
          <div className="flex items-center space-x-5">
            <SocialIcon href="#" icon={<Twitter size={20} />} />
            <SocialIcon href="#" icon={<Linkedin size={20} />} />
            <SocialIcon href="#" icon={<Facebook size={20} />} />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;