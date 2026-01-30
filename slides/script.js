const slideNum =9;

document.addEventListener("click", () => {
  const currentSlide = window.location.pathname.match(/(\d+)\.html$/)[1];
  const nextSlide = parseInt(currentSlide) + 1;
  if (currentSlide === slideNum.toString()) {
    return;
  }
  window.location.href = `${nextSlide}.html`;
})

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === " ") {
    const currentSlide = window.location.pathname.match(/(\d+)\.html$/)[1];
    if (currentSlide === slideNum.toString()) {
      return;
    }
    const nextSlide = parseInt(currentSlide) + 1;
    window.location.href = `${nextSlide}.html`;
  } else if (event.key === "ArrowLeft") {
    const currentSlide = window.location.pathname.match(/(\d+)\.html$/)[1];
    if (currentSlide === "1") {
      return;
    }
    const prevSlide = parseInt(currentSlide) - 1;
    window.location.href = `${prevSlide}.html`;
  }
});