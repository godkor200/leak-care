import { ContactFieldsDto } from './dto/contact-fields.dto';

// 폼의 주소 관련 필드만 골라 저장 형태로 바꾼다. address는 기본 주소 + 상세주소인 화면 표시용 전체 주소다.
export function pickAddress({
  address,
  addressDetail,
  postalCode,
  roadAddress,
  jibunAddress,
  sido,
  sigungu,
}: ContactFieldsDto) {
  return {
    address: addressDetail ? `${address} ${addressDetail}` : address,
    addressDetail,
    postalCode,
    roadAddress,
    jibunAddress,
    sido,
    sigungu,
  };
}

// 지도 검색어: 상세주소(동·호수)를 넣으면 검색이 안 되므로 도로명주소, 없으면 상세주소를 뺀 기본 주소를 쓴다
export function mapSearchAddress(report: {
  address: string;
  addressDetail?: string | null;
  roadAddress?: string | null;
}): string {
  if (report.roadAddress) {
    return report.roadAddress;
  }
  const suffix = report.addressDetail ? ` ${report.addressDetail}` : '';
  return suffix && report.address.endsWith(suffix)
    ? report.address.slice(0, -suffix.length)
    : report.address;
}
