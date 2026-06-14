# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

## [1.0.0] - 2026-06-14

### Добавлено

- Перехват ответа `/youtubei/v1/player` (XHR, fetch, `ytInitialPlayerResponse`)
  и удаление дублированных аудио-дорожек, чтобы плеер всегда выбирал
  оригинальную.
- Авто-переинициализация плеера (`loadVideoById`) на жёсткой загрузке, если
  он успел стартовать с дублированной дорожкой.
- Кнопка **ORIG / DUB** в панели плеера с подтверждением при выключении фикса.
- Попап с переключателем режима «Оригинал» / «Не вмешиваться», синхронный с
  кнопкой в плеере.
- Режим отладки (`DEBUG` в `inject.js`) с диагностическим объектом
  `window.__undubDbg`.

[1.0.0]: https://github.com/max31000/youtube-original-audio/releases/tag/v1.0.0
