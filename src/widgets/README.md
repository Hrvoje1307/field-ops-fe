# widgets

Groups of features that make a block of a screen (e.g. `job-detail`: details, status menu and history; the app shell). Widgets don't call the backend; they pass ids and compose features, e.g. through slots.

Imports: features, entities, shared, through their public API. Never another widget.
