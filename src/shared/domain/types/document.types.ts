import type { CLIENT_DOCUMENT_NUMBER_TYPE, DOCUMENT_NUMBER_TYPE } from '../constants';

export type ClientDocumentNumberType = (typeof CLIENT_DOCUMENT_NUMBER_TYPE)[number];
export type DocumentNumberType = (typeof DOCUMENT_NUMBER_TYPE)[number];
