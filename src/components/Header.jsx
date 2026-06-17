import { motion } from "framer-motion";
import { Radio } from "lucide-react";

export default function Header() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center gap-2 text-purple-400 font-bold text-base tracking-[0.2em] uppercase select-none"
    >
      <Radio size={18} className="animate-pulse" />
      <span>Owl Soundboard</span>
    </motion.div>
  );
}