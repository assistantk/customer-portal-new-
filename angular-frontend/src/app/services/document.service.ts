import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  constructor(private http: HttpClient) {}

  scanPan(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post('/api/documents/pan/scan', fd);
  }

  scanGstin(file: File, address?: string): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (address) fd.append('address', address);
    return this.http.post('/api/documents/gstin/scan', fd);
  }

  uploadPanFile(customerCode: string, file: File, panNumber?: string): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (panNumber) fd.append('panNumber', panNumber);
    return this.http.put(`/api/customers/${customerCode}/pan-file`, fd);
  }

  getGstins(customerCode: string): Observable<any> {
    return this.http.get(`/api/customers/${customerCode}/gstins`);
  }

  createGstin(customerCode: string, data: FormData): Observable<any> {
    return this.http.post(`/api/customers/${customerCode}/gstins`, data);
  }

  updateGstin(customerCode: string, gstinId: number, data: FormData): Observable<any> {
    return this.http.put(`/api/customers/${customerCode}/gstins/${gstinId}`, data);
  }

  deleteGstin(customerCode: string, gstinId: number): Observable<any> {
    return this.http.delete(`/api/customers/${customerCode}/gstins/${gstinId}`);
  }
}