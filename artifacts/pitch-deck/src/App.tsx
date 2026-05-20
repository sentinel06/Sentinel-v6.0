import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import slides from "./slideLoader";

function HomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (slides.length > 0) {
      navigate(`/slide${slides[0].position}`, { replace: true });
    }
  }, []);
  return null;
}

function AllSlides() {
  return (
    <div style={{ backgroundColor: "#000000" }}>
      {slides.map((slide) => (
        <div
          key={slide.id}
          className="slide relative overflow-hidden"
          style={{ width: "1920px", height: "1080px" }}
        >
          <div className="h-full w-full [&_.h-screen]:!h-full [&_.w-screen]:!w-full">
            <slide.Component />
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [location, navigate] = useLocation();

  // DO NOT edit: unknown-route redirect
  useEffect(() => {
    if (
      slides.length > 0 &&
      location !== "/" &&
      location !== "/allslides" &&
      !slides.some((s) => location === `/slide${s.position}`)
    ) {
      navigate(`/slide${slides[0].position}`, { replace: true });
    }
  }, [location]);

  // DO NOT edit: parent navigateToSlide postMessage listener
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "navigateToSlide" &&
        slides.some((s) => s.position === event.data.position)
      ) {
        navigate(`/slide${event.data.position}`);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <Switch>
      <Route path="/allslides" component={AllSlides} />
      <Route path="/" component={HomeRedirect} />
      {slides.map((slide) => (
        <Route
          key={slide.id}
          path={`/slide${slide.position}`}
          component={slide.Component}
        />
      ))}
    </Switch>
  );
}

export default App;
