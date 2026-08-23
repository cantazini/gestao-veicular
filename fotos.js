(function () {
  "use strict";

  const PHOTO_DEFINITIONS = [
    { key: "frontal", label: "Foto frontal", reportLabel: "Frontal" },
    { key: "traseira", label: "Foto traseira", reportLabel: "Traseira" },
    { key: "lateralEsquerda", label: "Foto lateral esquerda", reportLabel: "Lateral esquerda" },
    { key: "lateralDireita", label: "Foto lateral direita", reportLabel: "Lateral direita" },
    { key: "cabine", label: "Foto da cabine / interior", reportLabel: "Cabine / interior" },
    { key: "painel", label: "Foto do painel", reportLabel: "Painel" },
    { key: "adicional1", label: "Foto adicional 1", reportLabel: "Adicional 1" },
    { key: "adicional2", label: "Foto adicional 2", reportLabel: "Adicional 2" }
  ];

  const MAX_ORIGINAL_SIZE = 15 * 1024 * 1024;
  const MAX_DATA_URL_LENGTH = 220000;
  const MAX_TOTAL_DATA_LENGTH = 1760000;
  let selectedPhotos = {};

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Não foi possível ler esta imagem."));
      };
      image.src = objectUrl;
    });
  }

  function canvasDataUrl(image, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  }

  async function compressPhoto(file) {
    if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
    if (file.size > MAX_ORIGINAL_SIZE) throw new Error("A imagem original deve ter no máximo 15 MB.");

    const image = await loadImage(file);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const initialScale = Math.min(1, 1600 / largestSide);
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    let quality = 0.8;
    let dataUrl = "";

    for (let attempt = 0; attempt < 10; attempt += 1) {
      dataUrl = canvasDataUrl(image, width, height, quality);
      if (dataUrl.length <= MAX_DATA_URL_LENGTH) break;
      if (quality > 0.55) {
        quality -= 0.08;
      } else {
        width = Math.max(1, Math.round(width * 0.84));
        height = Math.max(1, Math.round(height * 0.84));
      }
    }

    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error("A foto continuou muito grande após a otimização. Tente outra imagem.");
    }

    return {
      dataUrl,
      nomeOriginal: file.name,
      mimeType: "image/jpeg",
      largura: width,
      altura: height,
      tamanhoOriginal: file.size,
      tamanhoArmazenado: Math.round(dataUrl.length * 0.75)
    };
  }

  function photoCard(definition) {
    return `
      <article class="photo-upload-card" data-photo-key="${definition.key}">
        <div class="photo-preview">
          <div class="photo-placeholder">
            <svg aria-hidden="true"><use href="#icon-camera"></use></svg>
            <span>Adicionar fotografia</span>
            <small>JPG, PNG ou imagem da câmera</small>
          </div>
          <img alt="Pré-visualização: ${definition.reportLabel}" hidden>
          <div class="photo-processing" hidden>Otimizando...</div>
        </div>
        <div class="photo-upload-meta">
          <strong>${definition.label}</strong>
          <span>Nenhuma imagem selecionada</span>
        </div>
        <div class="photo-upload-actions">
          <label class="button button-secondary compact photo-select-button">
            <svg aria-hidden="true"><use href="#icon-camera"></use></svg>
            <span>Selecionar</span>
            <input type="file" accept="image/*" aria-label="Selecionar ${definition.label.toLowerCase()}">
          </label>
          <button type="button" class="button button-ghost compact photo-remove-button" hidden>Remover</button>
        </div>
      </article>`;
  }

  function drawPhoto(key) {
    const card = document.querySelector(`[data-photo-key="${key}"]`);
    if (!card) return;
    const photo = selectedPhotos[key];
    const image = card.querySelector("img");
    const placeholder = card.querySelector(".photo-placeholder");
    const info = card.querySelector(".photo-upload-meta span");
    const selectText = card.querySelector(".photo-select-button > span");
    const removeButton = card.querySelector(".photo-remove-button");

    image.hidden = !photo;
    placeholder.hidden = Boolean(photo);
    removeButton.hidden = !photo;
    selectText.textContent = photo ? "Substituir" : "Selecionar";
    if (photo) {
      image.src = photo.dataUrl;
      info.textContent = `${photo.largura} × ${photo.altura} px • ${Math.max(1, Math.round(photo.tamanhoArmazenado / 1024))} KB`;
      card.classList.add("has-photo");
    } else {
      image.removeAttribute("src");
      info.textContent = "Nenhuma imagem selecionada";
      card.classList.remove("has-photo");
    }
  }

  function setProcessing(card, isProcessing) {
    card.classList.toggle("processing", isProcessing);
    card.querySelector(".photo-processing").hidden = !isProcessing;
    card.querySelector("input[type='file']").disabled = isProcessing;
  }

  function totalLengthReplacing(key, candidate) {
    return PHOTO_DEFINITIONS.reduce((total, definition) => {
      const photo = definition.key === key ? candidate : selectedPhotos[definition.key];
      return total + (photo ? photo.dataUrl.length : 0);
    }, 0);
  }

  async function handleFileInput(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const card = input.closest(".photo-upload-card");
    const key = card.dataset.photoKey;
    setProcessing(card, true);
    try {
      const photo = await compressPhoto(file);
      if (totalLengthReplacing(key, photo) > MAX_TOTAL_DATA_LENGTH) {
        throw new Error("O conjunto de fotos atingiu o limite seguro do armazenamento local.");
      }
      selectedPhotos[key] = photo;
      drawPhoto(key);
      const definition = PHOTO_DEFINITIONS.find((item) => item.key === key);
      window.AppUtils.toast("Foto adicionada", `${definition.reportLabel} pronta para ser salva com a vistoria.`, "success");
    } catch (error) {
      window.AppUtils.toast("Não foi possível adicionar a foto", error.message, "error");
    } finally {
      input.value = "";
      setProcessing(card, false);
    }
  }

  function removePhoto(key) {
    delete selectedPhotos[key];
    drawPhoto(key);
  }

  function getPhotos() {
    return PHOTO_DEFINITIONS.filter((definition) => selectedPhotos[definition.key]).map((definition) => ({
      key: definition.key,
      label: definition.reportLabel,
      ...selectedPhotos[definition.key]
    }));
  }

  function reset() {
    selectedPhotos = {};
    PHOTO_DEFINITIONS.forEach((definition) => drawPhoto(definition.key));
  }

  function init() {
    const container = document.querySelector("#photo-upload-grid");
    if (!container) return;
    container.innerHTML = PHOTO_DEFINITIONS.map(photoCard).join("");
    container.addEventListener("change", (event) => {
      if (event.target.matches("input[type='file']")) handleFileInput(event.target);
    });
    container.addEventListener("click", (event) => {
      const button = event.target.closest(".photo-remove-button");
      if (button) removePhoto(button.closest(".photo-upload-card").dataset.photoKey);
    });
  }

  window.FotosService = {
    init,
    reset,
    getPhotos,
    hasPhotos: () => getPhotos().length > 0,
    definitions: PHOTO_DEFINITIONS
  };
})();
