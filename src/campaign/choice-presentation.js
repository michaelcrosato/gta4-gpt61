import { OUTFITS } from '../wardrobe.js';

/** The simulation owns permission and payment. This view only names the
 * currently permitted authored choice for the shared story dialog.
 */
export function storyChoicePresentation(view) {
  if (!view?.active || !view.choicePending || view.dialogue) return null;
  const outfit = view.missionId === 'LL-ST-003' && view.stageId === 'workwear',
    id = outfit ? 'outfit' : 'room-response',
    choice = view.choices?.find((entry) => entry.id === id);
  if (!choice || (outfit ? view.choiceReady !== true : !view.dialogueReady)) return null;
  if (outfit && choice.options.some((option) => !Object.hasOwn(OUTFITS, option.id))) return null;
  const options = choice.options.map((option) => ({
    id: option.id,
    text: outfit ? OUTFITS[option.id].name : option.text,
    description: outfit ? OUTFITS[option.id].description : null,
  }));
  if (!options.length) return null;
  return {
    id,
    title: outfit ? 'Something to work in.' : 'A place to begin.',
    eyebrow: outfit ? 'PIER GOODS / CO-OP VOUCHER' : 'NIGHT CROSSING / NADIA',
    introduction: outfit
      ? 'Nadia’s co-op voucher covers one of these outfits. Choose what Mara wears; each is suitable for the job.'
      : 'Nadia has made space for you. What do you say?',
    prompt: outfit ? 'Choose a work outfit' : 'Respond to Nadia',
    error: outfit
      ? 'The outfit could not be purchased. Return to Bea’s counter and try again.'
      : 'Wait until Nadia has finished speaking.',
    options,
  };
}

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
export function storyChoiceMarkup(choice) {
  return (
    '<p>' +
    escape(choice.introduction) +
    '</p><div class="story-options">' +
    choice.options
      .map(
        (option) =>
          '<button data-story-option="' +
          escape(option.id) +
          '">' +
          (option.description
            ? '<b>' +
              escape(option.text) +
              '</b><span>' +
              escape(option.description) +
              '</span><small>COVERED BY VOUCHER</small>'
            : escape(option.text)) +
          '</button>',
      )
      .join('') +
    '</div>'
  );
}
