UPDATE client
SET
  document_number = CASE
    WHEN document_type = 'SIN DOCUMENTO'
    OR document_type = 'RUC' THEN NULL
    ELSE document_number
  END,
  document_number_type = CASE
    WHEN document_type = 'SIN DOCUMENTO'
    OR document_type = 'RUC' THEN NULL
    ELSE document_type::text::document_client_number_type
  END;