-- Add website_uri to places (Google Places API "websiteUri" field).
ALTER TABLE places ADD COLUMN website_uri text;
