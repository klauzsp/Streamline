import Image from "next/image";
import logo from "../logo.png";

export default function BrandMark() {
  return (
    <span className="streamline-mark" aria-hidden="true">
      <Image src={logo} alt="" sizes="56px" className="streamline-logo" />
    </span>
  );
}
