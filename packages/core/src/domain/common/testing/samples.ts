import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import { PhotoId } from "@repo/core/domain/common/ids";

/**
 * Sample addresses of `spec/testcases/ports/placeRepository.md`
 * 「テスト用の店舗」, built with `Address.of` the way a stored address is
 * rehydrated (fresh input goes through Area's `Town.toAddress`).
 */
export const SampleAddress = {
  otemachi: (rest = "1-1"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("1000004"),
        prefecture: "東京都",
        municipality: "千代田区",
        town: "大手町",
      },
      rest,
    ),
  ginza: (rest = "2-2"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("1040061"),
        prefecture: "東京都",
        municipality: "中央区",
        town: "銀座",
      },
      rest,
    ),
  umeda: (rest = "3-3"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("5300001"),
        prefecture: "大阪府",
        municipality: "大阪市北区",
        town: "梅田",
      },
      rest,
    ),
  chiyoda: (rest = "5-5"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("1000001"),
        prefecture: "東京都",
        municipality: "千代田区",
        town: "千代田",
      },
      rest,
    ),
};

export const samplePhotoId = (n: number): PhotoId =>
  PhotoId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
