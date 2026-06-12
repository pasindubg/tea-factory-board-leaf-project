// Shared palette + a few reusable style atoms, matching the web app's stone/green look.
import { StyleSheet } from "react-native";

export const colors = {
  bg: "#fafaf9", // stone-50
  card: "#ffffff",
  border: "#e7e5e4", // stone-200
  text: "#1c1917", // stone-900
  muted: "#78716c", // stone-500
  faint: "#a8a29e", // stone-400
  green: "#15803d", // green-700
  greenDark: "#166534", // green-800
  danger: "#b91c1c", // red-700
  dangerBg: "#fef2f2", // red-50
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  h1: { fontSize: 22, fontWeight: "600", color: colors.text },
  h2: { fontSize: 15, fontWeight: "500", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  faint: { fontSize: 13, color: colors.faint },
  label: { fontSize: 14, fontWeight: "500", color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d6d3d1", // stone-300
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  linkText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: 8, padding: 12 },
  errorText: { color: colors.danger, fontSize: 14 },
});
