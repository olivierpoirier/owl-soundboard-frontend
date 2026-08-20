import { motion } from "framer-motion";
import { Repeat2 } from "lucide-react";

export default function RepeatToggle({ menuOpen, panelOpen = menuOpen, toggleMenu }) {
  return (
    <motion.button
      onClick={toggleMenu}
      animate={{
        x: panelOpen ? 335 : 0,
        rotate: menuOpen ? 180 : 0,
      }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className={`fixed top-16 left-5 z-[60] p-2 rounded-xl border transition-colors ${
        menuOpen
          ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/30 shadow-[0_0_15px_rgba(52,211,153,0.2)]"
          : "text-white/40 bg-white/[0.02] border-white/10 hover:text-emerald-300 hover:border-emerald-400/30"
      }`}
      title="Répétitions"
    >
      <Repeat2 size={18} />
    </motion.button>
  );
}
