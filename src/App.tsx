import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastViewport } from "./components/ui";
import { Landing } from "./pages/Landing";
import { SubmitClaim } from "./pages/SubmitClaim";
import { Explore } from "./pages/Explore";
import { Dashboard } from "./pages/Dashboard";
import { ClaimDetail } from "./pages/ClaimDetail";
import { NotFound } from "./pages/NotFound";

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/submit" element={<SubmitClaim />} />
          <Route path="/claims" element={<Explore />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/claim/:id" element={<ClaimDetail />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}
