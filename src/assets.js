export const assetUrl = path => `${import.meta.env.BASE_URL}${path}`;
export const thumbnail = game => assetUrl(game?.metadata?.cover || 'no-cover.svg');
