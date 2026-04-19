import ProductDetail from "./ProductDetail.js";
import WishlistProducts from "./WishlistProducts.js";

export default function ProductsPage() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  if (params.has("asin")) return <ProductDetail />;
  if (params.has("wishlistId")) return <WishlistProducts />;
  return <p className="text-gray-500">ASIN またはウィッシュリスト ID が指定されていません。</p>;
}
